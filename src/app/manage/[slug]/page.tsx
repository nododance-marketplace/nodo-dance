import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { refreshPayoutsReady } from '@/lib/stripe'
import { OfferingForms } from './offering-forms'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  TEACHER: 'Teacher',
  ACADEMY: 'Academy',
  ORGANIZER: 'Organizer',
}

const LEVEL_LABEL: Record<string, string> = {
  Beginner: 'Beginner',
  Intermediate: 'Intermediate',
  Advanced: 'Advanced',
  'All levels': 'All levels',
}

function formatWhen(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
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
      month: 'short',
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

function parseStyles(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return 'Free'
  return `$${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}`
}

/**
 * Business dashboard. Only the owner gets in — a slug that exists but belongs
 * to someone else 404s, so we never confirm another business's existence.
 */
export default async function BusinessDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ onboarding?: string }>
}) {
  const { slug } = await params
  const { onboarding } = await searchParams

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/auth/signin')

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) redirect('/auth/signin')

  let business = await prisma.business.findUnique({
    where: { slug },
    include: {
      members: { where: { userId: user.id, role: 'OWNER' }, select: { id: true } },
    },
  })
  if (!business || business.members.length === 0) notFound()

  // Returning from Stripe's hosted onboarding: re-read the connected account
  // and store charges_enabled as the payouts-ready flag (server-side only).
  if (onboarding && business.stripeAccountId) {
    await refreshPayoutsReady(business.id)
    business = await prisma.business.findUnique({
      where: { slug },
      include: {
        members: { where: { userId: user.id, role: 'OWNER' }, select: { id: true } },
      },
    })
    if (!business || business.members.length === 0) notFound()
  }

  const now = new Date()
  const offerings = await prisma.offering.findMany({
    where: { businessId: business.id, status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    include: {
      sessions: {
        where: { status: 'SCHEDULED', startDateTime: { gte: now } },
        orderBy: { startDateTime: 'asc' },
        take: 1,
      },
    },
  })

  // Confirmed head-count per upcoming session, one grouped query for the page
  const nextSessionIds = offerings.flatMap((o) => o.sessions.map((s) => s.id))
  const counts = nextSessionIds.length
    ? await prisma.reservation.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: nextSessionIds }, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        _count: { _all: true },
      })
    : []
  const confirmedBySession = new Map(counts.map((c) => [c.sessionId!, c._count._all]))

  const upcomingEventSessions = new Map<string, { day: string; time: string; capacity: number; confirmed: number }>()
  for (const offering of offerings) {
    const next = offering.sessions[0]
    if (next && offering.type === 'EVENT') {
      const when = formatDayTime(next.startDateTime)
      upcomingEventSessions.set(offering.id, {
        day: when.day,
        time: when.time,
        capacity: next.capacityOverride ?? offering.capacity,
        confirmed: confirmedBySession.get(next.id) ?? 0,
      })
    }
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="text-sm text-gray-600">
            <Link href="/manage" className="hover:text-primary hover:underline">
              Manage Business
            </Link>
            <span aria-hidden="true"> /</span>
          </p>
          <h1 className="page-heading">{business.name}</h1>
          <p className="page-intro">
            {KIND_LABEL[business.kind] ?? business.kind}
            {business.city ? ` · ${business.city}` : ''}
            {` · Times shown in Eastern Time`}
          </p>
        </div>
      </div>

      <section aria-labelledby="payouts-heading" className="max-w-3xl">
        <h2 id="payouts-heading" className="text-xl font-bold text-primary mb-4">
          Payouts
        </h2>
        <div className="bg-surface border border-gray-200 rounded-xl p-5 data-card">
          {!business.stripeAccountId ? (
            <>
              <p className="text-sm text-gray-700">
                Connect a Stripe account to take payments for paid classes and
                tickets. Payouts go straight to your bank account — Nodo takes
                no cut.
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={`/api/stripe/onboard?slug=${business.slug}`}
                className="mt-3 inline-block px-4 py-2 rounded-md bg-primary text-primary-dark text-sm font-semibold"
              >
                Connect with Stripe →
              </a>
            </>
          ) : business.payoutsReady ? (
            <p className="text-sm text-gray-700">
              <span className="font-bold text-[var(--color-success)]">Connected ✓</span>{' '}
              — you can take payments. Paid offerings are charged to your Stripe
              account.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Your Stripe account is created but onboarding isn't finished, so
                payments are paused. Pick up where you left off.
              </p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href={`/api/stripe/onboard?slug=${business.slug}`}
                className="mt-3 inline-block px-4 py-2 rounded-md bg-primary text-primary-dark text-sm font-semibold"
              >
                Finish Stripe onboarding →
              </a>
            </>
          )}
        </div>
      </section>

      <nav aria-label="Operations" className="max-w-3xl mt-8 flex flex-wrap gap-4 text-sm">
        <Link href={`/manage/${slug}/bookings`} className="font-medium text-accent-ink hover:underline">
          Class rosters →
        </Link>
        <Link href={`/manage/${slug}/guests`} className="font-medium text-accent-ink hover:underline">
          Event guest lists →
        </Link>
        <Link href={`/manage/${slug}/reporting`} className="font-medium text-accent-ink hover:underline">
          Reporting →
        </Link>
        <Link href="/checkin" className="font-medium text-accent-ink hover:underline">
          Door check-in →
        </Link>
      </nav>

      <section aria-labelledby="offerings-heading" className="max-w-3xl">
        <h2 id="offerings-heading" className="text-xl font-bold text-primary mb-4">
          Your offerings
        </h2>

        {offerings.length === 0 ? (
          <div role="status" className="section-panel text-center py-10">
            <p className="text-sm font-medium text-gray-800">No offerings yet</p>
            <p className="mt-1 text-sm text-gray-600">
              Create your first class or event with the form below — it publishes
              immediately.
            </p>
          </div>
        ) : (
          <ul role="list" className="space-y-3">
            {offerings.map((offering) => {
              const next = offering.sessions[0]
              const eventWhen = upcomingEventSessions.get(offering.id)
              const styles = parseStyles(offering.styles)
              return (
                <li
                  key={offering.id}
                  className="bg-surface border border-gray-200 rounded-xl p-5 data-card"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
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
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-gray-900">{offering.title}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {offering.type === 'CLASS'
                          ? next
                            ? `Next session ${formatWhen(next.startDateTime)}`
                            : 'No upcoming sessions'
                          : eventWhen
                            ? `${eventWhen.day} · ${eventWhen.time}`
                            : 'No upcoming date'}
                        {` · ${offering.venueName ?? ''}`}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {offering.level ? `${LEVEL_LABEL[offering.level] ?? offering.level} · ` : ''}
                        {formatPrice(offering.price)}
                        {offering.partnerRequired ? ' · partner required' : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                      <p className="text-sm text-gray-800">
                        <span className="font-bold text-gray-900">
                          {eventWhen
                            ? eventWhen.confirmed
                            : next
                              ? (confirmedBySession.get(next.id) ?? 0)
                              : 0}
                        </span>
                        <span className="text-gray-600">
                          {' / '}
                          {eventWhen
                            ? eventWhen.capacity
                            : next
                              ? (next.capacityOverride ?? offering.capacity)
                              : offering.capacity}{' '}
                          confirmed
                        </span>
                      </p>
                      <Link
                        href={`/o/${offering.slug}`}
                        className="text-xs font-medium text-accent-ink hover:underline"
                      >
                        View public page →
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="mt-10 max-w-3xl">
        <OfferingForms businessId={business.id} timeZone={business.timeZone} />
      </div>
    </main>
  )
}
