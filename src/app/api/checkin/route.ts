import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

/**
 * Door check-in (M2). Staff paste or scan a NODO- code; the server validates
 * everything: ticket exists, belongs to a business the caller is staff for,
 * and its payment state. First scan flips ISSUED → CHECKED_IN inside a row
 * lock (the CheckIn.unique(ticketId) constraint is the backstop); repeat scans
 * report the original time; refunded / canceled / unknown codes fail with
 * clear messages.
 */
const schema = z.object({
  code: z.string().min(4).max(40),
  method: z.union([z.literal('QR'), z.literal('MANUAL')]).default('MANUAL'),
})

function normalizeCode(raw: string): string[] {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '')
  const candidates = new Set<string>([cleaned])
  if (!cleaned.startsWith('NODO-')) {
    candidates.add(`NODO-${cleaned.replace(/^NODO/, '')}`)
  }
  return [...candidates]
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, reason: 'AUTH_REQUIRED', message: 'Sign in to staff the door' }, { status: 401 })
    }
    const body = schema.parse(await request.json())

    const staff = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!staff) {
      return NextResponse.json({ ok: false, reason: 'AUTH_REQUIRED', message: 'Sign in to staff the door' }, { status: 401 })
    }

    // Accept a pasted full code or a bare hex code
    let ticket = null
    for (const candidate of normalizeCode(body.code)) {
      ticket = await prisma.ticket.findUnique({ where: { code: candidate } })
      if (ticket) break
    }

    if (!ticket) {
      return NextResponse.json({
        ok: false,
        reason: 'UNKNOWN_CODE',
        message: 'Unknown ticket code — check for typos or ask for their email.',
      })
    }

    // Ticket.offeringId is a bare column (no relation) — load the offering to
    // find which business's door this code belongs to
    const offering = await prisma.offering.findUnique({
      where: { id: ticket.offeringId },
      select: {
        id: true,
        title: true,
        businessId: true,
        business: { select: { name: true, slug: true } },
      },
    })
    if (!offering) {
      return NextResponse.json({
        ok: false,
        reason: 'UNKNOWN_CODE',
        message: 'Unknown ticket code — check for typos or ask for their email.',
      })
    }

    // The ticket's offering must belong to a business the caller is staff for.
    // Membership IS the assignment: a CHECKIN member covers their business's
    // events; an OWNER covers every business they own.
    const membership = await prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: offering.businessId, userId: staff.id },
      },
      select: { role: true },
    })
    if (!membership) {
      return NextResponse.json({
        ok: false,
        reason: 'NOT_STAFF',
        message: `You're not staff for ${offering.business.name} — this ticket belongs to their event.`,
      })
    }

    if (ticket.status === 'REFUNDED') {
      return NextResponse.json({
        ok: false,
        reason: 'REFUNDED',
        holder: ticket.holderName,
        message: 'This ticket was refunded — do not admit. Ask them to re-book.',
      })
    }
    if (ticket.status === 'CANCELED') {
      return NextResponse.json({
        ok: false,
        reason: 'CANCELED',
        holder: ticket.holderName,
        message: 'This ticket was canceled.',
      })
    }

    // First scan wins: lock the ticket row so two door devices scanning the
    // same code simultaneously still produce exactly one CheckIn row.
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "Ticket" WHERE id = ${ticket!.id} FOR UPDATE`
      const current = locked[0]
      if (!current) return { kind: 'unknown' as const }

      if (current.status === 'CHECKED_IN') {
        const existing = await tx.checkIn.findUnique({ where: { ticketId: ticket!.id } })
        return { kind: 'already' as const, at: existing?.createdAt ?? null }
      }
      if (current.status !== 'ISSUED') {
        return { kind: 'blocked' as const, status: current.status }
      }

      await tx.ticket.update({
        where: { id: ticket!.id },
        data: { status: 'CHECKED_IN' },
      })
      try {
        const checkIn = await tx.checkIn.create({
          data: {
            ticketId: ticket!.id,
            scannedBy: staff.id,
            method: body.method,
          },
        })
        return { kind: 'checked-in' as const, at: checkIn.createdAt }
      } catch (error: any) {
        // Unique(ticketId) backstop: a racing scan created it first
        if (error?.code === 'P2002') {
          const existing = await tx.checkIn.findUnique({ where: { ticketId: ticket!.id } })
          return { kind: 'already' as const, at: existing?.createdAt ?? null }
        }
        throw error
      }
    })

    if (result.kind === 'checked-in') {
      return NextResponse.json({
        ok: true,
        firstScan: true,
        holder: ticket.holderName,
        holderEmail: ticket.holderEmail,
        ticketCode: ticket.code,
        offeringTitle: offering.title,
        checkedInAt: result.at,
        message: `Welcome${ticket.holderName ? `, ${ticket.holderName}` : ''}! Checked in just now.`,
      })
    }

    if (result.kind === 'already') {
      const at = result.at
        ? result.at.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
          })
        : 'earlier'
      return NextResponse.json({
        ok: false,
        reason: 'ALREADY_CHECKED_IN',
        holder: ticket.holderName,
        holderEmail: ticket.holderEmail,
        ticketCode: ticket.code,
        offeringTitle: offering.title,
        checkedInAt: result.at,
        message: `Already checked in at ${at}.`,
      })
    }

    if (result.kind === 'blocked') {
      return NextResponse.json({
        ok: false,
        reason: result.status,
        message: `This ticket is ${result.status.toLowerCase()} — entry not allowed.`,
      })
    }

    return NextResponse.json({ ok: false, reason: 'UNKNOWN_CODE', message: 'Ticket not found.' })
  } catch (error: any) {
    console.error('[CHECKIN] Failed:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ ok: false, reason: 'ERROR', message: 'Something went wrong — try again.' }, { status: 500 })
  }
}
