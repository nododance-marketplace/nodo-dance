import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { sendWaitlistPromotion } from './email'

/**
 * Waitlist auto-promotion. When a spot frees up — a cancellation, a no-show,
 * an expired payment hold — the first WAITING entry (lowest position) is
 * promoted with a 24-hour claim window. The promoted spot is held for them:
 * capacity math counts live promotions, so nobody can take it in the meantime.
 * If the window passes, the entry expires and the spot rolls to the next in
 * line — lazily, on the next reserve/hold-release sweep. No cron.
 */

export const CLAIM_WINDOW_HOURS = 24

/** What a promotion email needs, gathered inside the sweep transaction. */
export type PromotedSpot = {
  email: string
  offeringTitle: string
  offeringSlug: string
  startTime: Date
  timeZone: string
  claimExpiresAt: Date
}

/**
 * Core sweep, scoped to an open transaction — the reserve/checkout guards call
 * it with their own tx, promoteFromWaitlist opens one. Serializes on the
 * session row lock (same guard as the booking flows) so two concurrent sweeps
 * can never double-promote the same spot.
 */
export async function sweepWaitlist(
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<PromotedSpot[]> {
  const now = new Date()

  // Serialize on the session row, then expire overdue claims first — every
  // expired promotion frees its spot again for the next in line
  await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`
  await tx.waitlistEntry.updateMany({
    where: { sessionId, status: 'PROMOTED', claimExpiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  })

  const sessionRow = await tx.classSession.findUnique({
    where: { id: sessionId },
    include: {
      offering: { select: { title: true, slug: true, timeZone: true, capacity: true } },
    },
  })
  if (!sessionRow || sessionRow.status !== 'SCHEDULED' || sessionRow.startDateTime <= now) {
    return []
  }
  const capacity = sessionRow.capacityOverride ?? sessionRow.offering.capacity

  const promoted: PromotedSpot[] = []
  for (;;) {
    // A confirmed head plus every live promotion must stay under capacity —
    // promoting fills the freed spot without ever overselling
    const booked = await tx.reservation.count({
      where: { sessionId, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
    })
    const livePromotions = await tx.waitlistEntry.count({
      where: { sessionId, status: 'PROMOTED', claimExpiresAt: { gt: now } },
    })
    if (booked + livePromotions >= capacity) break

    const next = await tx.waitlistEntry.findFirst({
      where: { sessionId, status: 'WAITING' },
      orderBy: { position: 'asc' },
    })
    if (!next) break

    const claimExpiresAt = new Date(now.getTime() + CLAIM_WINDOW_HOURS * 60 * 60 * 1000)
    await tx.waitlistEntry.update({
      where: { id: next.id },
      data: { status: 'PROMOTED', claimExpiresAt },
    })
    promoted.push({
      email: next.email,
      offeringTitle: sessionRow.offering.title,
      offeringSlug: sessionRow.offering.slug,
      startTime: sessionRow.startDateTime,
      timeZone: sessionRow.offering.timeZone,
      claimExpiresAt,
    })
  }
  return promoted
}

/**
 * Email everyone the sweep promoted. Always called AFTER the sweep's
 * transaction has committed, and each send is wrapped so a failed email never
 * breaks the booking flow — the promotion stands either way, and the dancer
 * can also claim from /my-tickets.
 */
export async function notifyPromotedSpots(spots: PromotedSpot[]): Promise<void> {
  for (const spot of spots) {
    try {
      await sendWaitlistPromotion({ ...spot, to: spot.email })
    } catch (emailError) {
      console.error('[WAITLIST] Promotion email failed (spot still held):', emailError)
    }
  }
}

/**
 * Promote one session's waitlist and email whoever moved up. Called after any
 * path that frees a spot outside the reserve flow: cancellations, no-shows,
 * expired payment holds. Nothing here may break the caller — a failed sweep
 * just means the next reserve request sweeps instead.
 */
export async function promoteFromWaitlist(sessionId: string): Promise<void> {
  try {
    const promoted = await prisma.$transaction((tx) => sweepWaitlist(tx, sessionId))
    await notifyPromotedSpots(promoted)
  } catch (error) {
    console.error('[WAITLIST] Promotion sweep failed:', error)
  }
}
