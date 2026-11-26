import { Prisma } from '@prisma/client'

/**
 * Class packs (M3). A PackPurchase is a card of N credits at one business;
 * spending one is a guarded decrement inside the booking's own transaction,
 * and the PackSpend row is the ledger — one per reservation, so restoring a
 * canceled booking is "delete the spend row + increment back", idempotent by
 * construction. All credit math lives here, server-side only (spec rule 3).
 */

type Tx = Prisma.TransactionClient

/** Parse the JSON string column the same way every other JSON-array column is read. */
export function parsePackStyles(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

/** A card's expiry: purchasedAt + monthsValid calendar months. */
export function packExpiry(purchasedAt: Date, monthsValid: number): Date {
  return addMonths(purchasedAt, monthsValid)
}

/**
 * Which of the holder's cards can pay for this class: ACTIVE, not expired,
 * credits left, right business, and the class's style is eligible (an empty
 * eligibleStyles list means "all styles"). Soonest-expiring card first, so
 * credits never strand on a card about to lapse.
 */
export function pickApplicablePack<
  T extends {
    id: string
    creditsRemaining: number
    expiresAt: Date
    pack: { eligibleStyles: string }
  },
>(purchases: T[], offeringStylesJson: string): T | null {
  const offeringStyles = JSON.parse(offeringStylesJson) as string[]
  const styles: string[] = Array.isArray(offeringStyles) ? offeringStyles : []
  const applicable = purchases.filter((p) => {
    const eligible = parsePackStyles(p.pack.eligibleStyles)
    return eligible.length === 0 || eligible.some((s) => styles.includes(s))
  })
  return applicable[0] ?? null
}

/** Query shape for the holder's spendable cards — used with findMany + pickApplicablePack. */
export function spendablePackFilter(
  userId: string,
  businessId: string,
  now = new Date()
): Prisma.PackPurchaseWhereInput {
  return {
    userId,
    businessId,
    status: 'ACTIVE',
    expiresAt: { gt: now },
    creditsRemaining: { gt: 0 },
  }
}

/**
 * Deduct one credit inside the caller's transaction. The guard
 * (`creditsRemaining > 0` in the WHERE of the same atomic update that
 * decrements) makes double-spend impossible: two concurrent bookings queue on
 * the row lock and re-evaluate the guard after the first commits, so the
 * second sees the new remaining count. Returns false when the card raced to
 * zero and the caller should fall back to a non-pack booking.
 */
export async function spendPackCredit(
  tx: Tx,
  packPurchaseId: string,
  reservationId: string
): Promise<boolean> {
  const spent = await tx.packPurchase.updateMany({
    where: { id: packPurchaseId, creditsRemaining: { gt: 0 } },
    data: { creditsRemaining: { decrement: 1 } },
  })
  if (spent.count === 0) return false

  await tx.packSpend.create({
    data: { packPurchaseId, reservationId, credits: 1 },
  })

  // Last credit gone → the card is spent. Restores flip it back to ACTIVE.
  const card = await tx.packPurchase.findUnique({
    where: { id: packPurchaseId },
    select: { creditsRemaining: true, status: true },
  })
  if (card && card.creditsRemaining <= 0 && card.status === 'ACTIVE') {
    await tx.packPurchase.update({
      where: { id: packPurchaseId },
      data: { status: 'EXHAUSTED' },
    })
  }
  return true
}

/**
 * Restore the credit for a canceled reservation — but only when the
 * offering's cancellation policy still allows it. Reads the policy's hour
 * window out of the free-text policy (default 4 hours, the schema default's
 * promise); a cancellation after that window keeps the credit spent.
 *
 * Idempotent: no PackSpend row (non-pack reservation) or a replayed restore
 * finds nothing and returns 'NOT_PACK' / 'ALREADY_RESTORED'.
 */
export async function restorePackCreditIfAllowed(
  tx: Tx,
  reservationId: string,
  now = new Date()
): Promise<'RESTORED' | 'NOT_PACK' | 'POLICY_WINDOW_PASSED' | 'ALREADY_RESTORED'> {
  const spend = await tx.packSpend.findUnique({ where: { reservationId } })
  if (!spend) return 'NOT_PACK'

  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    select: {
      sessionId: true,
      session: {
        select: { startDateTime: true, offering: { select: { cancellationPolicy: true } } },
      },
    },
  })
  if (!reservation?.session) return 'POLICY_WINDOW_PASSED'

  if (!cancellationAllowed(reservation.session.offering.cancellationPolicy, reservation.session.startDateTime, now)) {
    return 'POLICY_WINDOW_PASSED'
  }

  // Delete-then-increment: the unique(reservationId) ledger row is the
  // idempotency key — a concurrent restore deletes it first and this one no-ops.
  const deleted = await tx.packSpend.deleteMany({ where: { id: spend.id } })
  if (deleted.count === 0) return 'ALREADY_RESTORED'

  await tx.packPurchase.update({
    where: { id: spend.packPurchaseId },
    data: { creditsRemaining: { increment: spend.credits } },
  })
  const card = await tx.packPurchase.findUnique({
    where: { id: spend.packPurchaseId },
    select: { status: true, creditsRemaining: true },
  })
  if (card && card.status === 'EXHAUSTED' && card.creditsRemaining > 0) {
    await tx.packPurchase.update({
      where: { id: spend.packPurchaseId },
      data: { status: 'ACTIVE' },
    })
  }
  return 'RESTORED'
}

/**
 * The offering's cancellationPolicy is free text ("Free cancellation up to 4
 * hours before start"). Parse the first "N hours/days" promise out of it;
 * anything unparseable falls back to the 4-hour schema default.
 */
export function parseCancellationHours(policy: string | null | undefined): number {
  if (!policy) return 4
  const days = policy.match(/(\d+)\s*day/i)
  if (days) return parseInt(days[1], 10) * 24
  const hours = policy.match(/(\d+)\s*hour/i)
  if (hours) return parseInt(hours[1], 10)
  return 4
}

export function cancellationAllowed(
  policy: string | null | undefined,
  sessionStart: Date,
  now = new Date()
): boolean {
  const cutoff = sessionStart.getTime() - parseCancellationHours(policy) * 60 * 60 * 1000
  return now.getTime() <= cutoff
}
