import Stripe from 'stripe'
import { prisma } from './prisma'

/**
 * Stripe client (M2). The key lives in STRIPE_SECRET_KEY (test mode for the
 * M2 preview). Nothing fails at import time — a missing or broken key blows up
 * loudly at call time instead, so a misconfigured deploy still serves every
 * free flow.
 */
let stripeClient: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set — payments are unavailable. ' +
        'Set it in the environment (test mode for preview deployments).'
    )
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key)
  }
  return stripeClient
}

/** Read the app base URL the same way the email lib does (no side effects). */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
  const isUsable = explicit && !explicit.includes('localhost')
  if (isUsable) return explicit
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return explicit || 'http://localhost:3000'
}

/**
 * Re-read the connected account and store charges_enabled into
 * Business.payoutsReady. Called when Stripe sends the owner back from
 * onboarding. Safe to call repeatedly; failures never throw — payouts stay
 * flagged not-ready and the owner can retry.
 */
export async function refreshPayoutsReady(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, stripeAccountId: true },
  })
  if (!business?.stripeAccountId) return false
  try {
    const account = await getStripe().accounts.retrieve(business.stripeAccountId)
    const ready = Boolean(account.charges_enabled)
    await prisma.business.update({
      where: { id: business.id },
      data: { payoutsReady: ready },
    })
    return ready
  } catch (error) {
    console.error('[STRIPE] Failed to refresh payouts readiness:', error)
    return false
  }
}
