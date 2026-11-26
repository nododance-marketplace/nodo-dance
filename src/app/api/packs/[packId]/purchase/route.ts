import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { getStripe, getAppBaseUrl, isStripeConfigured } from '@/lib/stripe'
import { packExpiry } from '@/lib/packs'

/**
 * Buy a class pack (M3). Signed-in users only — a pack is account-bound credit.
 * Two paths, mirroring the M2 checkout split:
 *  - free preview pack (price 0): the PackPurchase is created ACTIVE directly;
 *  - paid: a PENDING_PAYMENT PackPurchase holds the intent and a Stripe
 *    Checkout Session (mode payment) collects it — the webhook's
 *    checkout.session.completed flips it PENDING_PAYMENT → ACTIVE via the
 *    packPurchaseId metadata. Order/OrderItem models stay untouched.
 * Everything server-side: price and credits come from the ClassPack row, never
 * the client.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const allowed = await checkRateLimit({
      identifier: session.user.email,
      action: 'buy-pack',
      limit: 20,
      window: 3600,
    })
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

    const pack = await prisma.classPack.findUnique({
      where: { id: packId },
      include: { business: { select: { id: true, name: true, stripeAccountId: true, payoutsReady: true } } },
    })
    if (!pack) {
      return NextResponse.json({ error: 'Pack not found' }, { status: 404 })
    }

    const purchasedAt = new Date()
    const expiresAt = packExpiry(purchasedAt, pack.monthsValid)

    // Free preview pack: no Stripe, issued immediately
    if (pack.price === null || pack.price <= 0) {
      const purchase = await prisma.packPurchase.create({
        data: {
          packId: pack.id,
          userId: user.id,
          businessId: pack.businessId,
          creditsTotal: pack.credits,
          creditsRemaining: pack.credits,
          purchasedAt,
          expiresAt,
          status: 'ACTIVE',
        },
      })
      return NextResponse.json(
        {
          success: true,
          purchaseId: purchase.id,
          status: purchase.status,
          creditsRemaining: purchase.creditsRemaining,
        },
        { status: 201 }
      )
    }

    // Paid pack: Stripe Checkout on the business's connected account (same
    // direct-charge shape as the M2 checkout — Nodo takes no cut, spec rule 4)
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'PAYMENTS_UNAVAILABLE', message: 'Payments are temporarily unavailable' },
        { status: 503 }
      )
    }
    if (!pack.business.payoutsReady) {
      return NextResponse.json(
        { error: 'STRIPE_NOT_CONNECTED', message: 'This business has not finished connecting payouts yet' },
        { status: 409 }
      )
    }

    // Idempotency: an unpaid checkout for the same card is reused instead of
    // stacking duplicate PENDING_PAYMENT rows. A second checkout session for
    // it is fine — the webhook's status guard converges.
    const existing = await prisma.packPurchase.findFirst({
      where: { packId: pack.id, userId: user.id, status: 'PENDING_PAYMENT' },
    })
    const purchase =
      existing ??
      (await prisma.packPurchase.create({
        data: {
          packId: pack.id,
          userId: user.id,
          businessId: pack.businessId,
          creditsTotal: pack.credits,
          creditsRemaining: pack.credits,
          purchasedAt,
          expiresAt,
          status: 'PENDING_PAYMENT',
        },
      }))

    const base = getAppBaseUrl()
    const stripe = getStripe()
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: pack.currency,
              unit_amount: Math.round(pack.price * 100),
              product_data: { name: `${pack.business.name} — ${pack.name}` },
            },
          },
        ],
        metadata: { packPurchaseId: purchase.id },
        payment_intent_data: {
          metadata: { packPurchaseId: purchase.id },
        },
        success_url: `${base}/my-tickets?pack=1`,
        cancel_url: `${base}/my-tickets`,
      },
      pack.business.stripeAccountId
        ? { stripeAccount: pack.business.stripeAccountId }
        : undefined
    )

    if (!checkoutSession.url) {
      return NextResponse.json({ error: 'STRIPE_SESSION_FAILED' }, { status: 500 })
    }
    return NextResponse.json(
      { url: checkoutSession.url, purchaseId: purchase.id, reused: Boolean(existing) },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[PACKS] Purchase failed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
