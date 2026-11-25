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
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

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
  const confirmed = next
    ? await prisma.reservation.count({
        where: { sessionId: next.id, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
      })
    : 0
  const capacity = next ? (next.capacityOverride ?? offering.capacity) : offering.capacity
  const styles = parseStyles(offering.styles)
  const eventWhen = next && offering.type === 'EVENT' ? formatDayTime(next.startDateTime) : null

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

        <p className="mt-3 text-lg text-gray-700">{formatPrice(offering.price)}</p>

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
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
