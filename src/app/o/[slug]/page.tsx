import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BookPanel } from './book-panel'

export const dynamic = 'force-dynamic'

const LEVEL_LABEL: Record<string, string> = {
  Beginner: 'Beginner',
  Intermediate: 'Intermediate',
  Advanced: 'Advanced',
  'All levels': 'All levels',
}

function parseStyles(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

function formatDayTime(date: Date): { day: string; time: string } {
  return {
    day: date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    }),
    time: date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    }),
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return 'Free'
  return `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)} per person`
}

/**
 * Public offering page — the native-listing counterpart to imported event
 * pages. Every booking decision shown here is recomputed server-side; the
 * panel only renders.
 */
export default async function OfferingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { slug } = await params
  const { error } = await searchParams

  const offering = await prisma.offering.findUnique({
    where: { slug },
    include: {
      business: { select: { name: true, slug: true, city: true } },
      sessions: {
        where: { status: 'SCHEDULED', startDateTime: { gte: new Date() } },
        orderBy: { startDateTime: 'asc' },
        take: 1,
      },
    },
  })
  if (!offering || offering.status !== 'PUBLISHED') notFound()

  const session = await getServerSession(authOptions)
  const isSignedIn = Boolean(session?.user?.email)

  const next = offering.sessions[0] ?? null

  // Confirmed head-count. Paid offerings count live payment holds too (a spot
  // someone is paying for is not available); free ones keep the M1 count.
  const paid = offering.price !== null
  const confirmed = next
    ? paid
      ? await prisma.reservation.count({
          where: {
            sessionId: next.id,
            OR: [
              { status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
              {
                status: 'PENDING_PAYMENT',
                order: { status: 'PENDING_PAYMENT', expiresAt: { gt: new Date() } },
              },
            ],
          },
        })
      : await prisma.reservation.count({
          where: { sessionId: next.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        })
    : 0
  const capacity = next ? (next.capacityOverride ?? offering.capacity) : offering.capacity
  const styles = parseStyles(offering.styles)
  const eventWhen = next && offering.type === 'EVENT' ? formatDayTime(next.startDateTime) : null

  // Ticketed events: per-tier availability = inventory - sold - live holds
  let tiers: { id: string; name: string; price: number; remaining: number }[] = []
  if (offering.isTicketed) {
    const rows = await prisma.ticketTier.findMany({
      where: { offeringId: offering.id },
      orderBy: { createdAt: 'asc' },
    })
    const holds = await prisma.order.groupBy({
      by: ['tierId'],
      where: {
        offeringId: offering.id,
        status: 'PENDING_PAYMENT',
        expiresAt: { gt: new Date() },
      },
      _count: { _all: true },
    })
    const holdsByTier = new Map(holds.map((h) => [h.tierId, h._count._all]))
    tiers = rows.map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      remaining: Math.max(t.inventory - t.sold - (holdsByTier.get(t.id) ?? 0), 0),
    }))
  }

  return (
    <main className="page-shell">
      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-gray-600">
          <Link
            href={`/manage/${offering.business.slug}`}
            className="font-medium text-accent-ink hover:underline"
          >
            {offering.business.name}
          </Link>
          {offering.business.city ? <span> · {offering.business.city}</span> : null}
        </p>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              offering.type === 'CLASS'
                ? 'bg-gray-100 text-gray-800'
                : 'bg-accent-coral/15 text-accent-ink'
            }`}
          >
            {offering.type === 'CLASS' ? 'Class' : 'Event'}
          </span>
          {styles.map((s) => (
            <span key={s} className="text-xs text-gray-600">
              {s}
            </span>
          ))}
          {offering.level && (
            <span className="text-xs text-gray-600">
              {LEVEL_LABEL[offering.level] ?? offering.level}
            </span>
          )}
        </div>

        <h1 className="mt-3 text-4xl md:text-5xl font-bold text-primary leading-tight">
          {offering.title}
        </h1>

        <p className="mt-3 text-lg text-gray-700">
          {offering.isTicketed && tiers.length > 0
            ? `From $${Math.min(...tiers.map((t) => t.price)) % 1 === 0 ? Math.min(...tiers.map((t) => t.price)).toFixed(0) : Math.min(...tiers.map((t) => t.price)).toFixed(2)} — pick a tier below`
            : formatPrice(offering.price)}
        </p>

        {error && (
          <div role="alert" className="mt-4 bg-surface border border-[var(--color-error)] rounded-xl p-4 text-sm text-[var(--color-error)]">
            {error === 'CLASS_FULL' || error === 'EVENT_FULL' || error === 'TIER_SOLD_OUT'
              ? 'That spot was just taken — it sold out before your payment started.'
              : error === 'STRIPE_NOT_CONNECTED'
                ? 'The organizer has not finished connecting payouts yet — payments are paused.'
                : error === 'PAYMENTS_UNAVAILABLE'
                  ? 'Payments are temporarily unavailable — please try again later.'
                  : 'Checkout could not start. Please try again.'}
          </div>
        )}

        {next && (
          <p className="mt-1 text-sm text-gray-600">
            {offering.type === 'CLASS'
              ? `Next session ${formatDateTime(next.startDateTime)}`
              : `${eventWhen!.day} · ${eventWhen!.time}`}
          </p>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* What / who / where */}
          <div className="lg:col-span-3 space-y-6">
            <section aria-label="Details" className="section-panel">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-gray-500">Date</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">
                    {eventWhen ? eventWhen.day : 'Weekly'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Time</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">
                    {eventWhen
                      ? eventWhen.time
                      : next
                        ? next.startDateTime.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'America/New_York',
                          })
                        : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Venue</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">{offering.venueName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Capacity</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">
                    {confirmed} / {capacity} confirmed
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Price</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">{formatPrice(offering.price)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Partner</dt>
                  <dd className="mt-0.5 text-gray-900 font-medium">
                    {offering.partnerRequired ? 'Required — bring your own' : 'Not required'}
                  </dd>
                </div>
              </dl>
              {offering.partnerRequired && (
                <p className="mt-4 text-sm text-accent-ink">
                  A partner is required for this offering — come with someone or
                  arrange one ahead of time.
                </p>
              )}
            </section>

            {offering.description && (
              <section aria-label="About" className="section-panel">
                <h2 className="text-lg font-bold text-gray-900">About</h2>
                <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                  {offering.description}
                </p>
              </section>
            )}

            {offering.cancellationPolicy && (
              <p className="text-xs text-gray-500 px-1">{offering.cancellationPolicy}.</p>
            )}
          </div>

          {/* Booking */}
          <div className="lg:col-span-2">
            {!next ? (
              <div className="bg-surface border border-gray-200 rounded-xl p-6">
                <p className="text-sm text-gray-700">
                  No upcoming {offering.type === 'CLASS' ? 'sessions' : 'dates'} right
                  now — check back soon.
                </p>
              </div>
            ) : (
              <BookPanel
                slug={offering.slug}
                type={offering.type === 'CLASS' ? 'CLASS' : 'EVENT'}
                price={offering.price}
                isSignedIn={isSignedIn}
                confirmed={confirmed}
                capacity={capacity}
                sessionId={next.id}
                tiers={tiers.length > 0 ? tiers : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
