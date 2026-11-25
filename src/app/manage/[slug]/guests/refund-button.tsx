'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Refund button for a paid order. Posts to the business-scoped OWNER-only
 * endpoint, which creates the Stripe refund on the connected account and flips
 * the order + ticket statuses (the webhook replay is a no-op).
 */
export function RefundButton({ slug, orderId }: { slug: string; orderId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refund() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/manage/${slug}/orders/${orderId}/refund`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(
          data?.error === 'ALREADY_REFUNDED'
            ? 'Already refunded'
            : 'Refund failed'
        )
        return
      }
      router.refresh()
    } catch {
      setError('Refund failed')
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-[var(--color-error)] underline-offset-2 hover:underline"
        >
          Refund
        </button>
        {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={refund}
        disabled={busy}
        className="text-xs font-medium text-[var(--color-error)] disabled:opacity-40"
      >
        {busy ? 'Refunding…' : 'Confirm refund'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-xs text-gray-600 underline-offset-2 hover:underline disabled:opacity-40"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-[var(--color-error)]">{error}</span>}
    </span>
  )
}
