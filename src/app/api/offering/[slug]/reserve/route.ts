import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendReservationConfirmation } from '@/lib/email'

/**
 * Reserve a spot in a class session (M1: free classes only). Capacity is
 * enforced inside a transaction that first locks the session row — concurrent
 * bookings for the same class queue behind that lock, so the count below can
 * never be raced into overselling (spec: transactional guard, no read-then-write).
 */
const schema = z.object({
  sessionId: z.string().min(1),
  guestEmail: z.string().email().optional(),
  guestName: z.string().min(1).max(100).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const data = schema.parse(body)

    // Guests must identify themselves; signed-in users carry their account
    if (!session?.user?.email && (!data.guestEmail || !data.guestName)) {
      return NextResponse.json(
        { error: 'guestEmail and guestName are required for guest reservations' },
        { status: 400 }
      )
    }

    // Light IP-based limit on this public endpoint — enough to stop scripted
    // waitlist spam without touching a real person booking a class
    const allowed = await checkRateLimit({
      identifier: getClientIp(request),
      action: 'reserve',
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
    if (offering.type !== 'CLASS') {
      return NextResponse.json(
        { error: 'This endpoint is for classes — use RSVP for events' },
        { status: 400 }
      )
    }
    // M1 ships free flows first; paid drop-ins arrive in M2
    if (offering.price !== null) {
      return NextResponse.json(
        { error: 'PAID_BOOKING_NOT_AVAILABLE', message: 'Paid bookings are coming soon' },
        { status: 409 }
      )
    }

    const sessionRow = await prisma.classSession.findUnique({
      where: { id: data.sessionId },
    })
    if (!sessionRow || sessionRow.offeringId !== offering.id) {
      return NextResponse.json({ error: 'Class session not found' }, { status: 404 })
    }
    if (sessionRow.status !== 'SCHEDULED') {
      return NextResponse.json({ error: 'SESSION_CANCELED' }, { status: 409 })
    }
    if (sessionRow.startDateTime <= new Date()) {
      return NextResponse.json({ error: 'SESSION_NOT_BOOKABLE' }, { status: 409 })
    }

    // Resolve the account identity from the DB, never from the client
    let userId: string | null = null
    let userEmail: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true },
      })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 400 })
      }
      userId = user.id
      userEmail = user.email
    }

    const guestEmail = data.guestEmail ? data.guestEmail.toLowerCase() : null
    // Secure link token for guest access — returned once, in the response below
    const guestToken = userId ? null : randomBytes(24).toString('hex')

    type ReserveOutcome =
      | { kind: 'reserved'; reservationId: string; alreadyReserved: boolean }
      | { kind: 'waitlisted'; position: number }
      | { kind: 'full' }

    const outcome: ReserveOutcome = await prisma.$transaction(async (tx) => {
      // Serialize all bookings for this session on one row lock
      await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionRow.id} FOR UPDATE`

      // Idempotency: a confirmed reservation wins over a duplicate request
      const existing = await tx.reservation.findFirst({
        where: {
          sessionId: sessionRow.id,
          status: 'CONFIRMED',
          ...(userId ? { userId } : { guestEmail }),
        },
      })
      if (existing) {
        return { kind: 'reserved', reservationId: existing.id, alreadyReserved: true }
      }

      const count = await tx.reservation.count({
        where: {
          sessionId: sessionRow.id,
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        },
      })
      const capacity = sessionRow.capacityOverride ?? offering.capacity

      if (count < capacity) {
        const reservation = await tx.reservation.create({
          data: {
            sessionId: sessionRow.id,
            offeringId: offering.id,
            userId,
            guestEmail,
            guestName: userId ? null : data.guestName ?? null,
            guestToken,
            // Guests have no account yet — they are walk-in style bookings
            source: userId ? 'ACCOUNT' : 'DROPIN',
            status: 'CONFIRMED',
          },
        })
        return { kind: 'reserved', reservationId: reservation.id, alreadyReserved: false }
      }

      // Full. Signed-in users can join the waitlist; guests are told it's full.
      // M2 (waitlist promotion): when a spot opens, the promotion email —
      // "you're in, claim it before <claimExpiresAt>" — goes here and in the
      // promotion flow itself. Nothing is sent while merely waiting.
      if (!userId || !userEmail) {
        return { kind: 'full' }
      }
      const alreadyWaiting = await tx.waitlistEntry.findFirst({
        where: { sessionId: sessionRow.id, email: userEmail, status: 'WAITING' },
      })
      if (alreadyWaiting) {
        return { kind: 'waitlisted', position: alreadyWaiting.position }
      }
      const max = await tx.waitlistEntry.aggregate({
        where: { sessionId: sessionRow.id },
        _max: { position: true },
      })
      const entry = await tx.waitlistEntry.create({
        data: {
          sessionId: sessionRow.id,
          email: userEmail,
          position: (max._max.position ?? 0) + 1,
          status: 'WAITING',
        },
      })
      return { kind: 'waitlisted', position: entry.position }
    })

    if (outcome.kind === 'reserved') {
      // Transactional confirmation — awaited but wrapped so a failed email
      // never fails the booking. Only sent on first confirmation, not on
      // duplicate requests (idempotency means no repeat emails either).
      if (!outcome.alreadyReserved) {
        try {
          await sendReservationConfirmation({
            to: userId ? userEmail! : guestEmail!,
            holderName: data.guestName ?? null,
            offeringTitle: offering.title,
            startTime: sessionRow.startDateTime,
            timeZone: offering.timeZone,
            venueName: offering.venueName,
            cancellationPolicy: offering.cancellationPolicy,
            guestToken: userId ? null : guestToken,
          })
        } catch (emailError) {
          console.error(
            '[RESERVE] Confirmation email failed (booking still confirmed):',
            emailError
          )
        }
      }
      return NextResponse.json(
        {
          success: true,
          reservationId: outcome.reservationId,
          status: 'CONFIRMED',
          alreadyReserved: outcome.alreadyReserved,
          // Only for guests, and only on the first response — it is the key
          // to the secure link later, so we do not hand it out repeatedly
          guestToken: !outcome.alreadyReserved && guestToken ? guestToken : undefined,
        },
        { status: outcome.alreadyReserved ? 200 : 201 }
      )
    }

    if (outcome.kind === 'waitlisted') {
      return NextResponse.json(
        { success: true, waitlisted: true, position: outcome.position },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { error: 'CLASS_FULL', message: 'Class is full' },
      { status: 409 }
    )
  } catch (error: any) {
    console.error('Error reserving class:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
