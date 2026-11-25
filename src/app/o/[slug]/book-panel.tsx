'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'confirmed'; ticketToken?: string; waitlisted?: false }
  | { kind: 'already' }
  | { kind: 'waitlisted'; position: number }
  | { kind: 'full' }
  | { kind: 'error'; message: string }

interface Props {
  slug: string
  type: 'CLASS' | 'EVENT'
  price: number | null
  isSignedIn: boolean
  /** Spots already taken on the next bookable occurrence. */
  confirmed: number
  capacity: number
}

/**
 * Booking panel on the public offering page. The CTA posts to the reserve
 * (class) or RSVP (event) API; the server decides capacity, identity and
 * waitlist — this component only renders what the server answers.
 */
export function BookPanel({ slug, type, price, isSignedIn, confirmed, capacity }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  const paid = price !== null
  const soldOut = confirmed >= capacity
  const spotsLeft = Math.max(capacity - confirmed, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhase({ kind: 'submitting' })
    const endpoint = type === 'CLASS' ? 'reserve' : 'rsvp'
    try {
      const res = await fetch(`/api/offering/${slug}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isSignedIn
            ? {}
            : { guestName: guestName.trim(), guestEmail: guestEmail.trim() }
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'CLASS_FULL' || data.error === 'EVENT_FULL') {
          setPhase({ kind: 'full' })
        } else if (data.error === 'PAID_BOOKING_NOT_AVAILABLE' || data.error === 'PAID_EVENT_NOT_AVAILABLE') {
          setPhase({ kind: 'error', message: 'Paid bookings are coming soon — this preview is free only.' })
        } else {
          setPhase({
            kind: 'error',
            message:
              typeof data.error === 'string'
                ? data.error
                : 'Something went wrong — please try again.',
          })
        }
        return
      }
      if (data.waitlisted) {
        setPhase({ kind: 'waitlisted', position: data.position })
      } else if (data.alreadyReserved || data.alreadyRsvped) {
        setPhase({ kind: 'already' })
      } else {
        setPhase({ kind: 'confirmed', ticketToken: data.guestToken })
      }
    } catch {
      setPhase({ kind: 'error', message: 'Network error — please try again.' })
    }
  }

  if (phase.kind === 'confirmed') {
    return (
      <div role="status" className="bg-surface border border-gray-200 rounded-xl p-6">
        <p className="text-lg font-bold text-[var(--color-success)]">
          {type === 'CLASS' ? "You're booked!" : "You're on the list!"}
        </p>
        <p className="mt-2 text-sm text-gray-700">
          {type === 'CLASS'
            ? 'Your spot is confirmed. See you on the dance floor.'
            : 'Your spot is confirmed — your ticket is ready.'}
        </p>
        {phase.ticketToken && (
          <Link
            href={`/t/${phase.ticketToken}`}
            className="mt-4 inline-block text-sm font-medium text-accent-ink hover:underline"
          >
            Open your ticket →
          </Link>
        )}
        {!isSignedIn && !phase.ticketToken && (
          <p className="mt-4 text-xs text-gray-500">
            Save this page — it is your confirmation.
          </p>
        )}
      </div>
    )
  }

  if (phase.kind === 'already') {
    return (
      <div role="status" className="bg-surface border border-gray-200 rounded-xl p-6">
        <p className="text-lg font-bold text-gray-900">You're already booked</p>
        <p className="mt-2 text-sm text-gray-700">
          A confirmed reservation already exists for you — no duplicate was made.
        </p>
      </div>
    )
  }

  if (phase.kind === 'waitlisted') {
    return (
      <div role="status" className="bg-surface border border-gray-200 rounded-xl p-6">
        <p className="text-lg font-bold text-gray-900">You're on the waitlist</p>
        <p className="mt-2 text-sm text-gray-700">
          The class is full, but you are number {phase.position} in line. We'll
          move you up if a spot opens.
        </p>
      </div>
    )
  }

  if (phase.kind === 'full') {
    return (
      <div role="alert" className="bg-surface border border-gray-200 rounded-xl p-6">
        <p className="text-lg font-bold text-gray-900">
          {type === 'CLASS' ? 'Class is full' : 'This event is at capacity'}
        </p>
        <p className="mt-2 text-sm text-gray-700">
          {isSignedIn && type === 'CLASS'
            ? 'Sign-in waitlists are not available for this booking — check back later.'
            : 'All spots are taken. Check back later or find another offering.'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-gray-200 rounded-xl p-6">
      <p className="text-sm text-gray-700">
        {soldOut ? (
          <span className="font-bold text-[var(--color-error)]">Sold out</span>
        ) : (
          <>
            <span className="font-bold text-gray-900">{spotsLeft}</span>{' '}
            {spotsLeft === 1 ? 'spot' : 'spots'} left
          </>
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {!isSignedIn && (
          <div className="space-y-3">
            <div>
              <label htmlFor="guest-name" className="block text-sm font-medium text-gray-800 mb-1.5">
                Your name
              </label>
              <Input
                id="guest-name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="guest-email" className="block text-sm font-medium text-gray-800 mb-1.5">
                Email
              </label>
              <Input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <p className="mt-1 text-xs text-gray-500">
                Your confirmation link is sent to this email.
              </p>
            </div>
          </div>
        )}

        {phase.kind === 'error' && (
          <p role="alert" className="text-sm text-[var(--color-error)]">
            {phase.message}
          </p>
        )}

        <Button type="submit" size="lg" disabled={phase.kind === 'submitting'} className="w-full">
          {phase.kind === 'submitting'
            ? 'One moment…'
            : paid
              ? 'Get tickets'
              : type === 'CLASS'
                ? 'Book class'
                : 'RSVP free'}
        </Button>

        {!isSignedIn && (
          <p className="text-xs text-gray-500 text-center">
            Booking as a guest — no account needed.
          </p>
        )}
      </form>
    </div>
  )
}
