import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { sendReservationConfirmation } from '@/lib/email'
import { notifyPromotedSpots, sweepWaitlist, type PromotedSpot } from '@/lib/waitlist'
import { pickApplicablePack, spendPackCredit, spendablePackFilter } from '@/lib/packs'

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
      | { kind: 'reserved'; reservationId: string; alreadyReserved: boolean; packCreditsRemaining?: number }
      | { kind: 'waitlisted'; position: number }
      | { kind: 'full' }

    let promotedSpots: PromotedSpot[] = []
    const outcome: ReserveOutcome = await prisma.$transaction(async (tx) => {
      // Serialize all bookings for this session on one row lock
      await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionRow.id} FOR UPDATE`

      // Lazy waitlist sweep before any capacity decision: overdue promotions
      // expire back into the queue, and a freed spot (cancellation, no-show,
      // expired hold) is handed to the next in line
      promotedSpots = await sweepWaitlist(tx, sessionRow.id)

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

      // Live promotions hold real spots — count them against capacity so a
      // promoted dancer's claim can't be sniped while their window is open
      const livePromotions = await tx.waitlistEntry.count({
        where: { sessionId: sessionRow.id, status: 'PROMOTED', claimExpiresAt: { gt: new Date() } },
      })

      // A live promotion holds a real spot — its owner can claim even at full
      // capacity (their slot is one of the ones being counted)
      const myPromotion = userEmail
        ? await tx.waitlistEntry.findFirst({
            where: {
              sessionId: sessionRow.id,
              email: userEmail,
              status: 'PROMOTED',
              claimExpiresAt: { gt: new Date() },
            },
          })
        : null

      if (count + livePromotions < capacity || myPromotion) {
        // M3: a spendable pack covering this class's style pays with one
        // credit. The guarded decrement runs inside this same transaction —
        // creditsRemaining can never go negative, so two concurrent bookings
        // can never double-spend the last credit. If the card raced to zero
        // mid-booking, the dancer still gets the spot as a regular booking.
        let packPurchaseId: string | null = null
        if (userId) {
          const candidates = await tx.packPurchase.findMany({
            where: spendablePackFilter(userId, offering.businessId),
            include: { pack: { select: { name: true, eligibleStyles: true } } },
            orderBy: { expiresAt: 'asc' },
          })
          const pack = pickApplicablePack(candidates, offering.styles)
          if (pack) packPurchaseId = pack.id
        }

        const reservation = await tx.reservation.create({
          data: {
            sessionId: sessionRow.id,
            offeringId: offering.id,
            userId,
            guestEmail,
            guestName: userId ? null : data.guestName ?? null,
            guestToken,
            // Guests have no account yet — they are walk-in style bookings
            source: packPurchaseId ? 'PACK' : myPromotion ? 'WAITLIST' : userId ? 'ACCOUNT' : 'DROPIN',
            status: 'CONFIRMED',
          },
        })

        let packCreditsRemaining: number | undefined
        if (packPurchaseId) {
          const spent = await spendPackCredit(tx, packPurchaseId, reservation.id)
          if (spent) {
            const card = await tx.packPurchase.findUnique({
              where: { id: packPurchaseId },
              select: { creditsRemaining: true },
            })
            packCreditsRemaining = card?.creditsRemaining ?? undefined
          } else {
            // Last credit was spent by a concurrent booking — keep the spot,
            // pay the regular way
            packPurchaseId = null
            await tx.reservation.update({
              where: { id: reservation.id },
              data: { source: 'ACCOUNT' },
            })
          }
        }

        // Claiming turns the promotion into the booking itself
        if (myPromotion) {
          await tx.waitlistEntry.update({
            where: { id: myPromotion.id },
            data: { status: 'CLAIMED' },
          })
        }
        return {
          kind: 'reserved',
          reservationId: reservation.id,
          alreadyReserved: false,
          ...(packPurchaseId ? { packCreditsRemaining } : {}),
        }
      }

      // Full. Signed-in users can join the waitlist; guests are told it's full.
      // When a spot opens later, promoteFromWaitlist emails the next in line
      // ("claim it within 24 hours") — nothing is sent while merely waiting.
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

    // Promotion emails go out after the sweep's transaction has committed —
    // a failed email never fails the request (same guard as confirmations)
    await notifyPromotedSpots(promotedSpots)

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
          // Set when a class pack paid for this spot — the panel shows what's left
          packCreditsRemaining: outcome.packCreditsRemaining,
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
