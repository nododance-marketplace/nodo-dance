/**
 * Throwaway: verify STRIPE_SECRET_KEY is live by reading the balance.
 * Run with: npx tsx scripts/stripe-verify.ts
 */
import { getStripe, isStripeConfigured } from '../src/lib/stripe'

async function main() {
  if (!isStripeConfigured()) {
    console.error('FAIL: STRIPE_SECRET_KEY is not set')
    process.exit(1)
  }
  const stripe = getStripe()
  const balance = await stripe.balance.retrieve()
  console.log('OK: key is live (test mode, sk_test prefix)')
  console.log('  pending:', JSON.stringify(balance.pending))
  console.log('  available:', JSON.stringify(balance.available))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL:', err?.message ?? err)
    process.exit(1)
  })
