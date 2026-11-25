import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendTicketConfirmation } from '@/lib/email'

/**
 * Guest RSVP to an event (M1: free socials). Same transactional capacity guard
 * as class reservations, and the ticket is issued in the same transaction —
 * a confirmed spot always has exactly one ticket behind it.
 */
const schema = z.object({
  guestEmail: z.string().email().optional(),
  guestName: z.string().min(1).max(100).optional(),
})

/** Human-typeable unique ticket code, e.g. NODO-4F2A91C0. */
function generateTicketCode(): string {
  return `NODO-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const data = schema.parse(body)

    const allowed = await checkRateLimit({
      identifier: getClientIp(request),
      action: 'rsvp',
      limit: 30,
      window: 3600,
    })
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const offering = await prisma.offering.findUnique({ where: { slug } })
    if (!offering || offering.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Offering not found' }, { status: 404 })
    }
    if (offering.type !== 'EVENT') {
      return NextResponse.json(
        { error: 'This endpoint is for events — use reserve for classes' },
        { status: 400 }
      )
    }
    // M1 ships free flows first; ticketed/paid events arrive in M2
    if (offering.price !== null) {
      return NextResponse.json(
        { error: 'PAID_EVENT_NOT_AVAILABLE', message: 'Ticketed events are coming soon' },
        { status: 409 }
      )
    }
    // Ticketed events (M2) sell through the checkout flow, never the free RSVP
    if (offering.isTicketed) {
      return NextResponse.json(
        { error: 'TICKETED_EVENT', message: 'This event sells tickets — use Get tickets' },
        { status: 409 }
      )
    }

    // Resolve identity: signed-in users RSVP as themselves, everyone else
    // must supply guest contact info
    let userId: string | null = null
    let holderEmail = data.guestEmail ? data.guestEmail.toLowerCase() : null
    let holderName = data.guestName ?? null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, name: true },
      })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 400 })
      }
      userId = user.id
      holderEmail = holderEmail ?? user.email.toLowerCase()
      holderName = holderName ?? user.name ?? holderEmail
    }
    if (!holderEmail || !holderName) {
      return NextResponse.json(
        { error: 'guestEmail and guestName are required for guest RSVPs' },
        { status: 400 }
      )
    }

    // An M1 event has exactly one occurrence row — that's the whole reason
    // events flow through the same sessions table as classes
    const eventSessions = await prisma.classSession.findMany({
      where: { offeringId: offering.id },
      orderBy: { startDateTime: 'asc' },
    })
    if (eventSessions.length !== 1) {
      console.error(
        `[RSVP] Offering ${offering.id} has ${eventSessions.length} sessions, expected 1`
      )
      return NextResponse.json({ error: 'Event session misconfigured' }, { status: 409 })
    }

    const sessionRow = eventSessions[0]
    if (sessionRow.status !== 'SCHEDULED') {
      return NextResponse.json({ error: 'EVENT_CANCELED' }, { status: 409 })
    }
    if (sessionRow.startDateTime <= new Date()) {
      return NextResponse.json({ error: 'EVENT_NOT_BOOKABLE' }, { status: 409 })
    }

    // Shared between reservation and ticket so one secure link covers both
    const guestToken = randomBytes(24).toString('hex')

    type RsvpOutcome =
      | { kind: 'rsvped'; reservationId: string; ticketCode: string; alreadyRsvped: boolean }
      | { kind: 'full' }

    // Retry loop: the only unique constraint in play is Ticket.code, so a
    // P2002 means an astronomic code collision — regenerate and go again
    let outcome: RsvpOutcome | null = null
    for (let attempt = 0; attempt < 3 && !outcome; attempt++) {
      const ticketCode = generateTicketCode()
      outcome = await prisma.$transaction(async (tx) => {
        // Serialize all bookings for this event on one row lock
        await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionRow.id} FOR UPDATE`

        // Idempotency: a confirmed reservation (and its ticket) wins
        const existing = await tx.reservation.findFirst({
          where: {
            sessionId: sessionRow.id,
            status: 'CONFIRMED',
            ...(userId ? { userId } : { guestEmail: holderEmail }),
          },
        })
        if (existing) {
          const existingTicket = await tx.ticket.findFirst({
            where: { offeringId: offering.id, holderEmail: holderEmail! },
          })
          if (existingTicket) {
            return {
              kind: 'rsvped',
              reservationId: existing.id,
              ticketCode: existingTicket.code,
              alreadyRsvped: true,
            }
          }
          // Confirmed reservation without a ticket is a broken state — fail
          // loudly instead of issuing a second spot
          throw new Error(`Reservation ${existing.id} has no ticket`)
        }

        const count = await tx.reservation.count({
          where: {
            sessionId: sessionRow.id,
            status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          },
        })
        const capacity = sessionRow.capacityOverride ?? offering.capacity
        if (count >= capacity) {
          return { kind: 'full' }
        }

        const reservation = await tx.reservation.create({
          data: {
            sessionId: sessionRow.id,
            offeringId: offering.id,
            userId,
            guestEmail: userId ? null : holderEmail,
            guestName: userId ? null : holderName,
            guestToken: userId ? null : guestToken,
            source: userId ? 'ACCOUNT' : 'DROPIN',
            status: 'CONFIRMED',
          },
        })

        // Free event → no tier, no payment; tickets still exist so door
        // check-in works the same way from day one
        await tx.ticket.create({
          data: {
            code: ticketCode,
            offeringId: offering.id,
            tierId: null,
            holderEmail: holderEmail!,
            holderName,
            holderUserId: userId,
            guestToken: userId ? null : guestToken,
            status: 'ISSUED',
          },
        })

        return { kind: 'rsvped', reservationId: reservation.id, ticketCode, alreadyRsvped: false }
      })

      if (outcome.kind === 'full') break
    }

    if (!outcome || outcome.kind === 'full') {
      return NextResponse.json(
        { error: 'EVENT_FULL', message: 'This event is at capacity' },
        { status: 409 }
      )
    }

    // Transactional ticket email — awaited but wrapped so a failed email
    // never fails the RSVP. Only on first issuance; a duplicate request
    // returns the original ticket without emailing again.
    if (!outcome.alreadyRsvped) {
      try {
        await sendTicketConfirmation({
          to: holderEmail!,
          holderName,
          offeringTitle: offering.title,
          startTime: sessionRow.startDateTime,
          timeZone: offering.timeZone,
          venueName: offering.venueName,
          ticketCode: outcome.ticketCode,
          guestToken: userId ? null : guestToken,
        })
      } catch (emailError) {
        console.error(
          '[RSVP] Ticket email failed (ticket still issued):',
          emailError
        )
      }
    }

    return NextResponse.json(
      {
        success: true,
        reservationId: outcome.reservationId,
        ticketCode: outcome.ticketCode,
        // Only handed to guests on first issuance — it is the key to the
        // secure ticket link
        guestToken: outcome.alreadyRsvped ? undefined : userId ? undefined : guestToken,
        alreadyRsvped: outcome.alreadyRsvped,
      },
      { status: outcome.alreadyRsvped ? 200 : 201 }
    )
  } catch (error: any) {
    console.error('Error RSVPing to event:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
