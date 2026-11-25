import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAppBaseUrl, getStripe } from '@/lib/stripe'

/**
 * Stripe Express onboarding (M2, GET or POST /api/stripe/onboard?slug=...).
 * Only a signed-in OWNER of the business may connect payouts. Creates (once)
 * the Express account, mints an account_onboarding AccountLink and redirects
 * the owner to Stripe's hosted flow. The return URL lands back on the manage
 * dashboard with ?onboarding=return, where payoutsReady is refreshed from the
 * account's charges_enabled.
 */
export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    let slug = request.nextUrl.searchParams.get('slug')
    if (!slug && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as { slug?: string } | null
      slug = body?.slug ?? null
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

    // Ownership is membership-based: the business must exist AND the caller
    // must be its OWNER. Anything else 404s — never confirm another
    // business's existence (same rule as the manage dashboard).
    const business = await prisma.business.findFirst({
      where: {
        slug,
        members: { some: { userId: user.id, role: 'OWNER' } },
      },
    })
    if (!business) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const stripe = getStripe()

    // Reuse the connected account across onboarding attempts
    let accountId = business.stripeAccountId
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        metadata: { businessId: business.id, businessSlug: business.slug },
      })
      accountId = account.id
      await prisma.business.update({
        where: { id: business.id },
        data: { stripeAccountId: accountId },
      })
    }

    const base = getAppBaseUrl()
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: `${base}/manage/${business.slug}?onboarding=refresh`,
      return_url: `${base}/manage/${business.slug}?onboarding=return`,
    })

    // Native form navigations follow the redirect; fetch callers read `url`
    if (request.method === 'GET') {
      return NextResponse.redirect(accountLink.url, 303)
    }
    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    console.error('[STRIPE] Onboarding failed:', error)
    return NextResponse.json({ error: 'STRIPE_ONBOARDING_FAILED' }, { status: 500 })
  }
}
