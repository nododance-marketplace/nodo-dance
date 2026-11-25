'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * No-show toggle for a roster row. Calls the business-scoped PATCH endpoint;
 * the server re-checks staff access and session ownership before flipping.
 */
export function RosterActions({
  slug,
  reservationId,
  status,
}: {
  slug: string
  reservationId: string
  status: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const isNoShow = status === 'NO_SHOW'
  const next = isNoShow ? 'CONFIRMED' : 'NO_SHOW'

  async function toggle() {
    setBusy(true)
    setError(false)
    try {
      const res = await fetch(`/api/manage/${slug}/reservations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId, status: next }),
      })
      if (!res.ok) {
        setError(true)
        return
      }
      router.refresh()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || status === 'CHECKED_IN'}
        className={`text-xs font-medium underline-offset-2 disabled:opacity-40 ${
          isNoShow ? 'text-gray-700 hover:underline' : 'text-[var(--color-error)] hover:underline'
        }`}
      >
        {busy ? '…' : isNoShow ? 'Restore' : 'No-show'}
      </button>
      {error && <span className="text-xs text-[var(--color-error)]">failed</span>}
    </span>
  )
}
