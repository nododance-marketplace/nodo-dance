import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { promoteFromWaitlist } from '@/lib/waitlist'

/**
 * Roster actions (M2): mark / unmark a no-show on a class reservation.
 * Business-scoped: the reservation must belong to an offering of the business
 * in the URL, and the caller must be an OWNER or INSTRUCTOR there. Everyone
 * else 404s — business-scoped access is enforced here, never by hiding UI.
 */
const schema = z.object({
  reservationId: z.string().min(1),
  status: z.union([z.literal('NO_SHOW'), z.literal('CONFIRMED'), z.literal('CHECKED_IN')]),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }
    const { slug } = await params
    const body = schema.parse(await request.json())

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

    const business = await prisma.business.findFirst({
      where: {
        slug,
        members: {
          some: { userId: user.id, role: { in: ['OWNER', 'INSTRUCTOR'] } },
        },
      },
      select: { id: true },
    })
    if (!business) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // The reservation must belong to THIS business — not just exist
    const reservation = await prisma.reservation.findFirst({
      where: { id: body.reservationId, offering: { businessId: business.id } },
      select: { id: true, status: true, sessionId: true },
    })
    if (!reservation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Paid holds are the checkout flow's business — not roster-markable
    if (reservation.status === 'PENDING_PAYMENT') {
      return NextResponse.json({ error: 'PENDING_PAYMENT' }, { status: 409 })
    }

    const updated = await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: body.status },
      select: { id: true, status: true },
    })

    // A no-show frees the spot — hand it to the next dancer in line (lazily,
    // and never blocking the roster write)
    const freedSpot =
      ['CONFIRMED', 'CHECKED_IN'].includes(reservation.status) &&
      !['CONFIRMED', 'CHECKED_IN'].includes(body.status)
    if (freedSpot && reservation.sessionId) {
      await promoteFromWaitlist(reservation.sessionId)
    }

    return NextResponse.json({ success: true, status: updated.status })
  } catch (error: any) {
    console.error('[ROSTER] Status update failed:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
