import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { applyTrustDelta } from '@/lib/event-validity'

/**
 * Community reports. One report per (event, reporterKey); the key is a hash
 * of the session token (or IP for signed-out visitors) so nobody can
 * double-report, while never storing raw identifiers. At REPORT_THRESHOLD
 * distinct reports the event drops back to PENDING for admin review and the
 * organizer loses trust points.
 */
const REPORT_THRESHOLD = 3

/** Hash the reporter identity — we only ever store the digest. */
async function getReporterKey(request: NextRequest): Promise<string> {
  const cookieStore = await cookies()
  const sessionToken =
    cookieStore.get('next-auth.session-token')?.value ||
    cookieStore.get('__Secure-next-auth.session-token')?.value ||
    ''
  const ip = getClientIp(request)
  return createHash('sha256').update(`report:${sessionToken}:${ip}`).digest('hex')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    const event = await prisma.event.findUnique({ where: { id }, select: { id: true } })
    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const reporterKey = await getReporterKey(request)

    // Rate limit reports per reporter
    const allowed = await checkRateLimit({
      identifier: reporterKey,
      action: 'report-event',
      limit: 5,
      window: 3600, // 1 hour
    })
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many reports. Please wait a while and try again.' },
        { status: 429 }
      )
    }

    let reason: string | null = null
    try {
      const body = await request.json()
      if (body?.reason && typeof body.reason === 'string') {
        reason = body.reason.trim().slice(0, 500) || null
      }
    } catch {
      // Body is optional
    }

    try {
      await prisma.eventReport.create({ data: { eventId: id, reporterKey, reason } })
    } catch (error: any) {
      // Unique constraint on (eventId, reporterKey): already reported
      if (error?.code === 'P2002') {
        return NextResponse.json({ error: 'You have already reported this event.' }, { status: 409 })
      }
      throw error
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { reportCount: { increment: 1 } },
      select: { reportCount: true, status: true, submittedByUserId: true },
    })

    // Crossed the threshold: pull the event back to PENDING and take trust
    // from the organizer. The status guard keeps this from firing again on
    // every report past the third.
    if (updated.reportCount >= REPORT_THRESHOLD && updated.status === 'APPROVED') {
      await prisma.event.update({ where: { id }, data: { status: 'PENDING' } })
      await applyTrustDelta(updated.submittedByUserId, -2)
      console.warn(`[Reports] Event ${id} pulled back to PENDING after ${updated.reportCount} reports`)
    }

    return NextResponse.json({
      success: true,
      reportCount: updated.reportCount,
      reviewPending: updated.reportCount >= REPORT_THRESHOLD,
    })
  } catch (error) {
    console.error('Error reporting event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
