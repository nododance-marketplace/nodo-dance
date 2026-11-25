import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getStripe, getAppBaseUrl, isStripeConfigured } from '@/lib/stripe'
import {
  activeReservationFilter,
  newHoldExpiry,
  releaseExpiredOrders,
  unexpiredOrderFilter,
} from '@/lib/holds'
import { promoteFromWaitlist } from '@/lib/waitlist'

/**
 * Paid checkout (M2). Two paths:
 *  - paid CLASS drop-in: { sessionId } — creates Order + PENDING_PAYMENT
 *    Reservation inside the same locked transaction as the capacity guard
 *    (same shape as the free reserve flow; the reservation only becomes
 *    CONFIRMED when the Order flips PAID in the webhook).
 *  - paid EVENT tier: { tierId } — tier inventory guarded transactionally
 *    (inventory - sold - unexpired pending holds). An EVENT with no tiers uses
 *    the offering price and the session-level guard instead.
 * Server-side everything: price, capacity, identity are decided here, never on
 * the client. Stripe metadata carries orderId so webhooks reconcile.
 */

const schema = z.object({
  sessionId: z.string().min(1).optional(),
  tierId: z.string().min(1).optional(),
  guestEmail: z.string().email().optional(),
  guestName: z.string().min(1).max(100).optional(),
})

async function parseBody(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return { data: schema.parse(await request.json()), isForm: false }
  }
  const form = await request.formData()
  const get = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' && v.length > 0 ? v : undefined
  }
  return {
    data: schema.parse({
      sessionId: get('sessionId'),
      tierId: get('tierId'),
      guestEmail: get('guestEmail'),
      guestName: get('guestName'),
    }),
    isForm: true,
  }
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const { data, isForm } = await parseBody(request)
    const session = await getServerSession(authOptions)

    // Guests must identify themselves; signed-in users carry their account
    if (!session?.user?.email && (!data.guestEmail || !data.guestName)) {
      return fail(isForm, slug, 'IDENTITY_REQUIRED', 400,
        'guestEmail and guestName are required for guest checkout')
    }

    const allowed = await checkRateLimit({
      identifier: getClientIp(request),
      action: 'checkout',
      limit: 30,
      window: 3600,
    })
    if (!allowed) {
      return fail(isForm, slug, 'RATE_LIMITED', 429, 'Too many requests. Please try again later.')
    }

    // Lazy release: stale 30-minute holds free up before anything counts them
    const releasedSessionIds = await releaseExpiredOrders()
    // Every freed hold hands its spot to the next dancer in line (a no-op for
    // sessions without a waitlist)
    for (const sessionId of releasedSessionIds) {
      await promoteFromWaitlist(sessionId)
    }

    const offering = await prisma.offering.findUnique({
      where: { slug },
      include: { business: { select: { id: true, stripeAccountId: true, payoutsReady: true } } },
    })
    if (!offering || offering.status !== 'PUBLISHED') {
      return fail(isForm, slug, 'NOT_FOUND', 404, 'Offering not found')
    }

    if (!isStripeConfigured()) {
      return fail(isForm, slug, 'PAYMENTS_UNAVAILABLE', 503, 'Payments are temporarily unavailable')
    }
    if (!offering.business.payoutsReady) {
      return fail(isForm, slug, 'STRIPE_NOT_CONNECTED', 409,
        'This business has not finished connecting payouts yet')
    }

    // Resolve identity from the DB, never from the client
    let userId: string | null = null
    let userEmail: string | null = null
    let userName: string | null = null
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, email: true, name: true },
      })
      if (!user) return fail(isForm, slug, 'USER_NOT_FOUND', 400, 'User not found')
      userId = user.id
      userEmail = user.email
      userName = user.name
    }
    const holderEmail = (userId ? userEmail : data.guestEmail?.toLowerCase()) ?? null
    const holderName = (userId ? userName : data.guestName) ?? null
    if (!holderEmail || !holderName) {
      return fail(isForm, slug, 'IDENTITY_REQUIRED', 400, 'Name and email are required')
    }

    // Secure link token: the /t/{token} page shows "processing payment" until
    // the webhook flips the Order and issues the ticket / confirms the booking
    const guestToken = randomBytes(24).toString('hex')

    let created: {
      orderId: string
      amount: number
      currency: string
      label: string
      sessionId: string | null
      tierId: string | null
      reused: boolean
    } | null = null

    if (offering.type === 'CLASS') {
      if (!data.sessionId) {
        return fail(isForm, slug, 'SESSION_REQUIRED', 400, 'sessionId is required')
      }
      if (offering.price === null) {
        return fail(isForm, slug, 'FREE_FLOW', 409, 'This class is free — use the reserve flow')
      }
      if (offering.price <= 0) {
        return fail(isForm, slug, 'INVALID_PRICE', 409, 'Invalid price')
      }

      const sessionRow = await prisma.classSession.findUnique({ where: { id: data.sessionId } })
      if (!sessionRow || sessionRow.offeringId !== offering.id) {
        return fail(isForm, slug, 'NOT_FOUND', 404, 'Class session not found')
      }
      if (sessionRow.status !== 'SCHEDULED') {
        return fail(isForm, slug, 'SESSION_CANCELED', 409, 'This session was canceled')
      }
      if (sessionRow.startDateTime <= new Date()) {
        return fail(isForm, slug, 'SESSION_NOT_BOOKABLE', 409, 'This session already started')
      }

      created = await prisma.$transaction(async (tx) => {
        // Serialize all bookings for this session on one row lock — same guard
        // as the free reserve flow, extended to count live payment holds
        await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionRow.id} FOR UPDATE`

        // Idempotency: a live hold for the same person reuses its Order
        const existingOrder = await tx.order.findFirst({
          where: {
            sessionId: sessionRow.id,
            ...unexpiredOrderFilter(),
            ...(userId ? { userId } : { guestEmail: holderEmail }),
          },
        })
        if (existingOrder) {
          return {
            orderId: existingOrder.id,
            amount: existingOrder.amount,
            currency: existingOrder.currency,
            label: offering.title,
            sessionId: sessionRow.id,
            tierId: null,
            reused: true,
          }
        }

        const count = await tx.reservation.count({
          where: activeReservationFilter(sessionRow.id),
        })
        const capacity = sessionRow.capacityOverride ?? offering.capacity
        if (count >= capacity) {
          return null // CLASS_FULL
        }

        const order = await tx.order.create({
          data: {
            offeringId: offering.id,
            sessionId: sessionRow.id,
            userId,
            guestEmail: holderEmail,
            guestName: holderName,
            guestToken,
            amount: offering.price ?? 0,
            currency: offering.currency,
            status: 'PENDING_PAYMENT',
            expiresAt: newHoldExpiry(),
          },
        })
        // The reservation is a real spot held for 30 minutes; it only becomes
        // CONFIRMED when the Order flips PAID (webhook)
        await tx.reservation.create({
          data: {
            sessionId: sessionRow.id,
            offeringId: offering.id,
            userId,
            guestEmail: userId ? null : holderEmail,
            guestName: userId ? null : holderName,
            guestToken: userId ? null : guestToken,
            source: userId ? 'ACCOUNT' : 'DROPIN',
            status: 'PENDING_PAYMENT',
            paymentRef: order.id,
          },
        })
        return {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          label: offering.title,
          sessionId: sessionRow.id,
          tierId: null,
          reused: false,
        }
      })

      if (!created) {
        return fail(isForm, slug, 'CLASS_FULL', 409, 'Class is full')
      }
    } else {
      // EVENT
      let tier = null
      let eventPrice: number
      let label: string

      if (data.tierId) {
        tier = await prisma.ticketTier.findUnique({ where: { id: data.tierId } })
        if (!tier || tier.offeringId !== offering.id) {
          return fail(isForm, slug, 'NOT_FOUND', 404, 'Ticket tier not found')
        }
        if (tier.price <= 0) {
          return fail(isForm, slug, 'INVALID_PRICE', 409, 'Invalid price')
        }
        eventPrice = tier.price
        label = `${offering.title} — ${tier.name}`
      } else {
        if (offering.isTicketed) {
          return fail(isForm, slug, 'TIER_REQUIRED', 400, 'Choose a ticket tier')
        }
        if (offering.price === null) {
          return fail(isForm, slug, 'FREE_FLOW', 409, 'This event is free — use the RSVP flow')
        }
        if (offering.price <= 0) {
          return fail(isForm, slug, 'INVALID_PRICE', 409, 'Invalid price')
        }
        eventPrice = offering.price
        label = offering.title
      }

      // An M1-style event has exactly one occurrence row
      const eventSessions = await prisma.classSession.findMany({
        where: { offeringId: offering.id },
        orderBy: { startDateTime: 'asc' },
      })
      if (eventSessions.length !== 1) {
        return fail(isForm, slug, 'MISCONFIGURED', 409, 'Event session misconfigured')
      }
      const sessionRow = eventSessions[0]
      if (sessionRow.status !== 'SCHEDULED') {
        return fail(isForm, slug, 'EVENT_CANCELED', 409, 'This event was canceled')
      }
      if (sessionRow.startDateTime <= new Date()) {
        return fail(isForm, slug, 'EVENT_NOT_BOOKABLE', 409, 'This event already started')
      }

      created = await prisma.$transaction(async (tx) => {
        // Serialize ticket sales for this event on one row lock
        await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionRow.id} FOR UPDATE`

        // Idempotency: a live hold for the same person reuses its Order
        const existingOrder = await tx.order.findFirst({
          where: {
            offeringId: offering.id,
            sessionId: sessionRow.id,
            tierId: tier ? tier.id : null,
            ...unexpiredOrderFilter(),
            ...(userId ? { userId } : { guestEmail: holderEmail }),
          },
        })
        if (existingOrder) {
          return {
            orderId: existingOrder.id,
            amount: existingOrder.amount,
            currency: existingOrder.currency,
            label,
            sessionId: sessionRow.id,
            tierId: tier ? tier.id : null,
            reused: true,
          }
        }

        if (tier) {
          // Lock the tier row, then check inventory: sold + live holds must
          // stay under inventory. The count below can never be raced because
          // every sibling checkout queues behind this lock.
          await tx.$queryRaw`SELECT id FROM "TicketTier" WHERE id = ${tier.id} FOR UPDATE`
          const liveHolds = await tx.order.count({
            where: { tierId: tier.id, ...unexpiredOrderFilter() },
          })
          if (tier.sold + liveHolds >= tier.inventory) {
            return null // TIER_SOLD_OUT
          }
        } else {
          // Event-level (single-price) paid ticket: session capacity guard
          const paid = await tx.order.count({
            where: { sessionId: sessionRow.id, status: 'PAID' },
          })
          const holds = await tx.order.count({
            where: { sessionId: sessionRow.id, ...unexpiredOrderFilter() },
          })
          const rsvped = await tx.reservation.count({
            where: { sessionId: sessionRow.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
          })
          const capacity = sessionRow.capacityOverride ?? offering.capacity
          if (paid + holds + rsvped >= capacity) {
            return null // EVENT_FULL
          }
        }

        const order = await tx.order.create({
          data: {
            offeringId: offering.id,
            sessionId: sessionRow.id,
            tierId: tier ? tier.id : null,
            userId,
            guestEmail: holderEmail,
            guestName: holderName,
            guestToken,
            amount: eventPrice,
            currency: offering.currency,
            status: 'PENDING_PAYMENT',
            expiresAt: newHoldExpiry(),
          },
        })
        return {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          label,
          sessionId: sessionRow.id,
          tierId: tier ? tier.id : null,
          reused: false,
        }
      })

      if (!created) {
        return fail(
          isForm, slug,
          tier ? 'TIER_SOLD_OUT' : 'EVENT_FULL',
          409,
          tier ? 'This ticket tier is sold out' : 'This event is at capacity'
        )
      }
    }

    // Stripe Checkout on the business's connected account (direct charge, 0%
    // application fee — Nodo takes no cut, spec rule 4)
    const base = getAppBaseUrl()
    const stripe = getStripe()
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: holderEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: created.currency,
              unit_amount: dollarsToCents(created.amount),
              product_data: { name: created.label },
            },
          },
        ],
        metadata: {
          orderId: created.orderId,
          offeringId: offering.id,
          sessionId: created.sessionId ?? '',
          tierId: created.tierId ?? '',
        },
        payment_intent_data: {
          metadata: { orderId: created.orderId },
        },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // outlives the 30-min hold
        success_url: `${base}/t/${guestToken}?paid=1`,
        cancel_url: `${base}/o/${offering.slug}`,
      },
      offering.business.stripeAccountId
        ? { stripeAccount: offering.business.stripeAccountId }
        : undefined
    )

    await prisma.order.update({
      where: { id: created.orderId },
      data: { stripeSessionId: checkoutSession.id },
    })

    if (!checkoutSession.url) {
      return fail(isForm, slug, 'STRIPE_SESSION_FAILED', 500, 'Could not start checkout')
    }

    // Native form posts follow the 303 straight to Stripe; JSON callers read url
    if (isForm) {
      return NextResponse.redirect(checkoutSession.url, 303)
    }
    return NextResponse.json(
      { url: checkoutSession.url, orderId: created.orderId, reused: created.reused },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[CHECKOUT] Error creating checkout:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * JSON callers get structured errors; native form posts are bounced back to
 * the offering page with an error code the page renders as a banner.
 */
function fail(
  isForm: boolean,
  slug: string,
  code: string,
  status: number,
  message: string
) {
  if (isForm) {
    const base = getAppBaseUrl()
    return NextResponse.redirect(`${base}/o/${slug}?error=${encodeURIComponent(code)}`, 303)
  }
  return NextResponse.json({ error: code, message }, { status })
}
