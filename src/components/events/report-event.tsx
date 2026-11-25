'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Quiet "Report event" link that expands into a small inline form. Anyone
 * (signed in or not) can report; the server rate-limits and dedupes per
 * reporter.
 */
export function ReportEvent({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'duplicate' | 'error'>('idle')

  async function submit() {
    if (state === 'sending') return
    setState('sending')
    try {
      const res = await fetch(`/api/events/${eventId}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        setState('done')
      } else if (res.status === 409) {
        setState('duplicate')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p className="mt-6 text-sm text-[var(--color-muted)] flex items-center gap-1.5">
        <Flag className="w-3.5 h-3.5" />
        Thanks — this event has been reported and our team will take a look.
      </p>
    )
  }

  if (state === 'duplicate') {
    return (
      <p className="mt-6 text-sm text-[var(--color-muted)] flex items-center gap-1.5">
        <Flag className="w-3.5 h-3.5" />
        You have already reported this event.
      </p>
    )
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)] inline-flex items-center gap-1.5 transition-colors"
        aria-expanded={open}
      >
        <Flag className="w-3.5 h-3.5" />
        Report event
      </button>

      {open && (
        <div className="mt-3 max-w-md">
          {state === 'error' ? (
            <p className="text-sm text-[var(--color-accent-ink)]">
              Something went wrong. Please try again later.
            </p>
          ) : (
            <>
              <label htmlFor="report-reason" className="block text-sm text-[var(--color-muted)] mb-1.5">
                What is wrong with this event?
              </label>
              <textarea
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Wrong details, spam, not a dance event…"
                className="w-full rounded-md border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
              />
              <div className="flex items-center gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={submit} disabled={state === 'sending'}>
                  {state === 'sending' ? 'Reporting…' : 'Submit report'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
