import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'

/**
 * Inventory holds (M2). A checkout creates an Order in PENDING_PAYMENT with a
 * 30-minute expiresAt. Expired holds release lazily: every availability count
 * filters them out, and write paths additionally flip stale holds to CANCELED
 * so the state machine converges without a cron.
 */

export const HOLD_MINUTES = 30

export function newHoldExpiry(now = new Date()): Date {
  return new Date(now.getTime() + HOLD_MINUTES * 60 * 1000)
}

/** Orders still holding inventory: unpaid and not yet expired. */
export function unexpiredOrderFilter(now = new Date()): Prisma.OrderWhereInput {
  return { status: 'PENDING_PAYMENT', expiresAt: { gt: now } }
}

/**
 * Lazily release stale holds. Called on checkout write paths. Cheap updateMany
 * with an index on (status, expiresAt).
 */
export async function releaseExpiredOrders(): Promise<void> {
  const { prisma } = await import('./prisma')
  await prisma.order.updateMany({
    where: { status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() } },
    data: { status: 'CANCELED' },
  })
}

/**
 * Reservations that count against a class session's capacity: confirmed (or
 * already at the door), plus unpaid holds whose Order is still live. Expired
 * holds (PENDING_PAYMENT whose Order lapsed) are released — the reservation
 * row stays around only as history.
 */
export function activeReservationFilter(
  sessionId: string,
  now = new Date()
): Prisma.ReservationWhereInput {
  return {
    sessionId,
    OR: [
      { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      { status: 'PENDING_PAYMENT', order: unexpiredOrderFilter(now) },
    ],
  }
}

/** NODO-XXXX-unique human-typeable ticket code (same shape as the M1 RSVP). */
export function generateTicketCode(): string {
  return `NODO-${randomBytes(4).toString('hex').toUpperCase()}`
}
