'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Phase =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'confirmed'; ticketToken?: string; waitlisted?: false; packCreditsRemaining?: number }
  | { kind: 'already' }
  | { kind: 'waitlisted'; position: number }
  | { kind: 'full' }
  | { kind: 'error'; message: string }

interface Tier {
  id: string
  name: string
  price: number
  remaining: number
}

interface Props {
  slug: string
  type: 'CLASS' | 'EVENT'
  price: number | null
  isSignedIn: boolean
  /** Spots already taken on the next bookable occurrence. */
  confirmed: number
  capacity: number
  /** Next bookable session — classes reserve a specific occurrence. */
  sessionId: string
  /** M2: ticket tiers for a paid/ticketed event. */
  tiers?: Tier[]
  /** M3: the signed-in dancer holds a pack that covers this class. */
  packHint?: { credits: number; name: string } | null
}

function fmt(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

/**
 * Booking panel on the public offering page. Free flows post to the reserve /
 * RSVP API (server decides capacity, identity and waitlist). Paid flows are a
 * plain form POST to the checkout API — the server validates price, capacity
 * and identity, then 303-redirects to Stripe Checkout.
 */
export function BookPanel({
  slug,
  type,
  price,
  isSignedIn,
  confirmed,
  capacity,
  sessionId,
  tiers,
  packHint,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [tierId, setTierId] = useState<string>(
    () => tiers?.find((t) => t.remaining > 0)?.id ?? tiers?.[0]?.id ?? ''
  )

  const paid = price !== null
  const ticketed = Boolean(tiers && tiers.length > 0)
  const soldOut = ticketed
    ? tiers!.every((t) => t.remaining <= 0)
    : confirmed >= capacity
  const spotsLeft = Math.max(capacity - confirmed, 0)
  const checkout = paid || ticketed

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhase({ kind: 'submitting' })
    const endpoint = type === 'CLASS' ? 'reserve' : 'rsvp'
    try {
      const res = await fetch(`/api/offering/${slug}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'CLASS'
            ? isSignedIn
              ? { sessionId }
              : { sessionId, guestName: guestName.trim(), guestEmail: guestEmail.trim() }
            : isSignedIn
              ? {}
              : { guestName: guestName.trim(), guestEmail: guestEmail.trim() }
        ),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'CLASS_FULL' || data.error === 'EVENT_FULL') {
          setPhase({ kind: 'full' })
        } else if (data.error === 'PAID_BOOKING_NOT_AVAILABLE' || data.error === 'PAID_EVENT_NOT_AVAILABLE') {
          setPhase({ kind: 'error', message: 'This offering sells paid bookings — checkout is coming shortly.' })
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
        setPhase({
          kind: 'confirmed',
          ticketToken: data.guestToken,
          packCreditsRemaining:
            typeof data.packCreditsRemaining === 'number' ? data.packCreditsRemaining : undefined,
        })
      }
    } catch {
      setPhase({ kind: 'error', message: 'Network error — please try again.' })
    }
  }

  if (checkout) {
    // Paid flow: a plain HTML form posts to the checkout API, which validates
    // everything server-side and 303-redirects to Stripe's hosted payment.
    return (
      <div className="bg-surface border border-gray-200 rounded-xl p-6">
        {ticketed ? (
          <fieldset>
            <legend className="text-sm font-medium text-gray-800 mb-2">Ticket tiers</legend>
            <div className="space-y-2" role="radiogroup" aria-label="Ticket tier">
              {tiers!.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                    tierId === t.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${t.remaining <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="tierId"
                      value={t.id}
                      checked={tierId === t.id}
                      onChange={() => setTierId(t.id)}
                      disabled={t.remaining <= 0}
                      className="h-4 w-4"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">{t.name}</span>
                      <span className="block text-xs text-gray-600">
                        {t.remaining > 0 ? `${t.remaining} left` : 'Sold out'}
                      </span>
                    </span>
                  </span>
                  <span className="text-sm font-bold text-gray-900">${fmt(t.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
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
        )}

        <form method="POST" action={`/api/offering/${slug}/checkout`} className="mt-4 space-y-4">
          {type === 'CLASS' && <input type="hidden" name="sessionId" value={sessionId} />}
          {ticketed && <input type="hidden" name="tierId" value={tierId} />}
          {!isSignedIn && (
            <div className="space-y-3">
              <div>
                <label htmlFor="checkout-name" className="block text-sm font-medium text-gray-800 mb-1.5">
                  Your name
                </label>
                <Input
                  id="checkout-name"
                  name="guestName"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="checkout-email" className="block text-sm font-medium text-gray-800 mb-1.5">
                  Email
                </label>
                <Input
                  id="checkout-email"
                  name="guestEmail"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Your ticket is sent to this email.
                </p>
              </div>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full">
            {ticketed
              ? `Get tickets — $${fmt(tiers!.find((t) => t.id === tierId)?.price ?? 0)}`
              : `Pay $${fmt(price ?? 0)} & book`}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Secure checkout via Stripe — no account needed.
          </p>
        </form>
      </div>
    )
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
        {typeof phase.packCreditsRemaining === 'number' && (
          <p className="mt-2 text-sm font-medium text-accent-ink">
            {phase.packCreditsRemaining === 1
              ? 'That used the last credit on your pack.'
              : `${phase.packCreditsRemaining} classes left on your pack.`}
          </p>
        )}
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

      {packHint && packHint.credits > 0 && !soldOut && (
        <p className="mt-2 text-sm font-medium text-accent-ink">
          {packHint.credits === 1
            ? `You have 1 class left on your ${packHint.name} — booking uses it.`
            : `You have ${packHint.credits} classes left on your ${packHint.name} — booking uses one.`}
        </p>
      )}

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
