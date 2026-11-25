'use client'

import { useState } from 'react'

type Result = {
  ok: boolean
  message: string
  holder?: string | null
  holderEmail?: string | null
  ticketCode?: string
  offeringTitle?: string
  checkedInAt?: string | null
}

/**
 * The door tool. One big input, one big button, and a verdict panel that stays
 * readable at arm's length — green for admit, red for a problem.
 */
export function DoorScanner() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function scan(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, method: 'MANUAL' }),
      })
      const data = await res.json()
      if (res.status === 401) {
        setError('Your session expired — refresh the page and sign in again.')
        return
      }
      setLast(data as Result)
      if (data?.ok) setCode('')
    } catch {
      setError('Network error — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={scan} className="bg-surface border border-gray-200 rounded-xl p-6 space-y-4">
        <div>
          <label htmlFor="ticket-code" className="block text-sm font-medium text-gray-800 mb-1.5">
            Ticket code
          </label>
          <input
            id="ticket-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder="NODO-4F2A91C0"
            className="w-full rounded-md border border-gray-300 px-4 py-3 font-mono text-lg uppercase tracking-wider text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={busy || code.trim().length === 0}
          className="w-full rounded-md bg-primary text-primary-dark py-3 text-base font-bold disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Check in'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      {last && !error && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-xl border p-6 ${
            last.ok
              ? 'border-green-600 bg-green-50'
              : 'border-[var(--color-error)] bg-red-50'
          }`}
        >
          <p
            className={`text-xl font-bold ${
              last.ok ? 'text-green-800' : 'text-[var(--color-error)]'
            }`}
          >
            {last.ok ? '✓ Admit' : '✕ Do not admit'}
          </p>
          <p className={`mt-1 text-sm font-medium ${last.ok ? 'text-green-900' : 'text-gray-900'}`}>
            {last.message}
          </p>
          {last.ticketCode && (
            <p className="mt-3 text-xs text-gray-600">
              <span className="font-mono">{last.ticketCode}</span>
              {last.offeringTitle ? ` · ${last.offeringTitle}` : ''}
              {last.holderEmail ? ` · ${last.holderEmail}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
