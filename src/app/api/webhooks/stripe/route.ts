import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { generateTicketCode } from '@/lib/holds'
import { restorePackCreditIfAllowed } from '@/lib/packs'
import { sendTicketConfirmation, sendReservationConfirmation } from '@/lib/email'
import { promoteFromWaitlist } from '@/lib/waitlist'

/**
 * Stripe webhook (M2). Raw-body signature verification: Next route handlers
 * don't expose the raw bytes as a stream, but `await req.text()` returns the
 * body unmodified, which is exactly what constructEvent needs.
 *
 * Guarantees (spec):
 *  - idempotent: checkout.session.completed only transitions PENDING_PAYMENT →
 *    PAID, so replays are no-ops;
 *  - out-of-order safe: charge.refunded arriving before (or after) completion
 *    converges — a refunded order is never re-paid;
 *  - events for connected accounts land here too (Express accounts mirror
 *    their events to the platform endpoint) and reconcile via orderId metadata;
 *  - unknown event types are acknowledged, never thrown on.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[WEBHOOK] STRIPE_WEBHOOK_SECRET is not set — cannot verify signatures')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret)
  } catch (err: any) {
    console.error('[WEBHOOK] Signature verification failed:', err?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object)
        break
      default:
        // Unknown / unhandled types are fine — acknowledge and move on
        break
    }
  } catch (error) {
    console.error(`[WEBHOOK] Handler failed for ${event.type}:`, error)
    // Non-2xx makes Stripe retry with backoff
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/**
 * Payment completed: flip the Order to PAID, then issue what was bought —
 * a Ticket (event tiers and single-price events) or a CONFIRMED reservation
 * (paid class drop-in) — and send the matching confirmation email. Class
 * packs (M3) carry packPurchaseId metadata instead of orderId and flip their
 * PackPurchase PENDING_PAYMENT → ACTIVE.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.packPurchaseId) {
    await handlePackCheckoutCompleted(session)
    return
  }

  const orderId = session.metadata?.orderId
  if (!orderId) {
    console.error('[WEBHOOK] checkout.session.completed without orderId metadata — ignoring')
    return
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tier: true,
      offering: {
        include: { sessions: { orderBy: { startDateTime: 'asc' }, take: 1 } },
      },
    },
  })
  if (!order) {
    console.error(`[WEBHOOK] Order ${orderId} not found — ignoring`)
    return
  }

  // Idempotency + out-of-order: only an unpaid hold transitions to PAID. A
  // refund that already landed wins; a replay of this event is a no-op.
  if (order.status !== 'PENDING_PAYMENT') {
    console.log(`[WEBHOOK] Order ${orderId} already ${order.status} — skipping`)
    return
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : null

  const isEvent = order.offering.type === 'EVENT'
  const eventSession = order.offering.sessions[0] ?? null
  const classSession = order.sessionId
    ? await prisma.classSession.findUnique({ where: { id: order.sessionId } })
    : null
  const when = isEvent ? eventSession?.startDateTime : classSession?.startDateTime
  const emailTo = order.guestEmail ?? 'unknown@nododance.com'

  if (isEvent) {
    // Ticket issuance + sold counter + order flip all land atomically
    let ticketCode: string | null = null
    await prisma.$transaction(async (tx) => {
      if (order.status !== 'PENDING_PAYMENT') return
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' }, // guard inside the tx too
        data: {
          status: 'PAID',
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        },
      })
      if (updated.count === 0) return // a concurrent webhook got here first

      if (order.tierId) {
        await tx.ticketTier.update({
          where: { id: order.tierId },
          data: { sold: { increment: 1 } },
        })
      }

      const code = generateTicketCode()
      const ticket = await tx.ticket.create({
        data: {
          code,
          offeringId: order.offeringId,
          tierId: order.tierId,
          orderId: order.id,
          holderEmail: emailTo,
          holderName: order.guestName,
          holderUserId: order.userId,
          guestToken: order.guestToken,
          status: 'ISSUED',
        },
      })
      ticketCode = ticket.code
    })

    if (ticketCode) {
      try {
        await sendTicketConfirmation({
          to: emailTo,
          holderName: order.guestName,
          offeringTitle: order.offering.title,
          startTime: when ?? new Date(),
          timeZone: order.offering.timeZone,
          venueName: order.offering.venueName,
          ticketCode,
          guestToken: order.guestToken,
        })
      } catch (emailError) {
        console.error('[WEBHOOK] Ticket email failed (ticket still issued):', emailError)
      }
    }
  } else {
    // Paid class drop-in: confirm the held reservation
    let confirmed = false
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' },
        data: {
          status: 'PAID',
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        },
      })
      if (updated.count === 0) return

      const reservation = await tx.reservation.findFirst({
        where: { paymentRef: order.id },
      })
      if (!reservation) {
        console.error(`[WEBHOOK] Order ${order.id} has no reservation — broken state`)
        return
      }
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: 'CONFIRMED',
          guestToken: reservation.guestToken ?? order.guestToken,
        },
      })
      confirmed = true
    })

    if (confirmed) {
      try {
        await sendReservationConfirmation({
          to: emailTo,
          holderName: order.guestName,
          offeringTitle: order.offering.title,
          startTime: when ?? new Date(),
          timeZone: order.offering.timeZone,
          venueName: order.offering.venueName,
          cancellationPolicy: order.offering.cancellationPolicy,
          guestToken: order.guestToken,
        })
      } catch (emailError) {
        console.error('[WEBHOOK] Reservation email failed (booking still confirmed):', emailError)
      }
    }
  }
}

/**
 * Pack checkout completed (M3): flip the card PENDING_PAYMENT → ACTIVE so the
 * dancer can spend it. The status guard makes replays no-ops, same as orders.
 */
async function handlePackCheckoutCompleted(session: Stripe.Checkout.Session) {
  const packPurchaseId = session.metadata?.packPurchaseId
  if (!packPurchaseId) return

  const updated = await prisma.packPurchase.updateMany({
    where: { id: packPurchaseId, status: 'PENDING_PAYMENT' },
    data: { status: 'ACTIVE' },
  })
  if (updated.count === 0) {
    console.log(`[WEBHOOK] Pack purchase ${packPurchaseId} not pending — replay or refunded, skipping`)
    return
  }

  const purchase = await prisma.packPurchase.findUnique({
    where: { id: packPurchaseId },
    include: { pack: { select: { name: true, credits: true } } },
  })
  console.log(
    `[WEBHOOK] Pack purchase ${packPurchaseId} activated: ${purchase?.pack.credits ?? '?'} credits (${purchase?.pack.name ?? 'unknown pack'})`
  )
}

/**
 * Refund landed: mark the Order REFUNDED and demote what it bought — the
 * ticket becomes REFUNDED (door check-in will reject it), a paid class
 * reservation is canceled.
 */
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : null
  if (!paymentIntentId) {
    console.error('[WEBHOOK] charge.refunded without payment_intent — ignoring')
    return
  }

  const order = await prisma.order.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { ticket: true, reservation: true },
  })
  if (!order) {
    console.error(`[WEBHOOK] No order for payment intent ${paymentIntentId} — ignoring`)
    return
  }
  if (order.status === 'REFUNDED') {
    return // replay
  }

  let freedSpot = false
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: { in: ['PENDING_PAYMENT', 'PAID'] } },
      data: { status: 'REFUNDED' },
    })
    if (updated.count === 0) return

    if (order.ticket) {
      await tx.ticket.update({
        where: { id: order.ticket.id },
        data: { status: 'REFUNDED' },
      })
    }
    if (order.reservation && order.reservation.status === 'CONFIRMED') {
      await tx.reservation.update({
        where: { id: order.reservation.id },
        data: { status: 'CANCELED' },
      })
      freedSpot = true
      // M3: a pack-funded booking returns its credit when the policy window
      // still allows cancellation — a no-op for non-pack reservations.
      const restore = await restorePackCreditIfAllowed(tx, order.reservation.id)
      if (restore !== 'NOT_PACK') {
        console.log(`[WEBHOOK] Pack credit restore for reservation ${order.reservation.id}: ${restore}`)
      }
    }
  })

  // The canceled reservation frees a spot — offer it to the next in line
  if (freedSpot && order.sessionId) {
    await promoteFromWaitlist(order.sessionId)
  }
}
