import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStyleColor } from '@/lib/styleColors'

export const dynamic = 'force-dynamic'

/** Same badge palette as the business roster — one visual language. */
const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-gray-100 text-gray-800',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  CHECKED_IN: 'bg-green-100 text-green-800',
  WAITLISTED: 'bg-blue-100 text-blue-800',
  PROMOTED: 'bg-blue-100 text-blue-800',
  CANCELED: 'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  PENDING_PAYMENT: 'Payment pending',
  CHECKED_IN: 'Attended',
  WAITLISTED: 'Waitlisted',
  PROMOTED: 'Spot offered',
  CANCELED: 'Canceled',
}

function parseStyles(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Wall-clock time in the offering's own timezone; unknown zones fall back to UTC. */
function formatDateTime(date: Date, timeZone: string): string {
  try {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    })
  } catch {
    return date.toUTCString()
  }
}

/** UTC-stamped Google Calendar template URL — a plain link, no SDK. */
function googleCalendarUrl(title: string, start: Date, end: Date, location: string | null): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
  })
  if (location) params.set('location', location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

type BookingRow = {
  key: string
  kind: 'class' | 'event'
  title: string
  slug: string
  businessName: string
  style: string | null
  when: Date | null
  whenEnd: Date | null
  timeZone: string
  venue: string | null
  status: string
  ticketCode: string | null // event rows — opens /t/{code}
  waitlistPosition: number | null
  holdExpired: boolean
}

/**
 * My Tickets & Reservations — everything a signed-in dancer has booked: class
 * reservations and event tickets (upcoming, grouped by status) plus a collapsed
 * past. Guests keep using their /t/{token} links; this page is account-only.
 */
export default async function MyTicketsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/auth/signin?callbackUrl=/my-tickets')

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  })
  if (!user) redirect('/auth/signin?callbackUrl=/my-tickets')

  const now = new Date()

  const reservations = await prisma.reservation.findMany({
    where: { userId: user.id, sessionId: { not: null } },
    include: {
      offering: {
        select: {
          title: true,
          slug: true,
          type: true,
          styles: true,
          timeZone: true,
          venueName: true,
          business: { select: { name: true, slug: true } },
          sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
        },
      },
      session: { select: { startDateTime: true, endDateTime: true } },
      order: { select: { status: true, expiresAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Event RSVPs issue a ticket for the same offering — the ticket link wins
  const tickets = await prisma.ticket.findMany({
    where: { holderUserId: user.id },
    select: { code: true, status: true, offeringId: true },
  })
  const ticketByOffering = new Map(tickets.map((t) => [t.offeringId, t]))

  // Waitlist spots are keyed by email (same key the reserve route uses)
  const waitlistEntries = await prisma.waitlistEntry.findMany({
    where: { email: user.email, status: { in: ['WAITING', 'PROMOTED'] } },
    include: {
      session: {
        select: {
          startDateTime: true,
          endDateTime: true,
          offering: {
            select: {
              title: true,
              slug: true,
              styles: true,
              timeZone: true,
              venueName: true,
              business: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
    orderBy: { position: 'asc' },
  })

  // M3 class packs: live cards, soonest-expiring first. Expired cards are
  // filtered here (and everywhere) by expiresAt — status EXPIRED is bookkeeping.
  const packsRemaining = await prisma.packPurchase.findMany({
    where: { userId: user.id, status: 'ACTIVE', expiresAt: { gt: now }, creditsRemaining: { gt: 0 } },
    include: {
      pack: { select: { name: true } },
      business: { select: { name: true, slug: true } },
    },
    orderBy: { expiresAt: 'asc' },
  })

  const reservationRows: BookingRow[] = reservations.map((r) => {
    const ticket = ticketByOffering.get(r.offeringId) ?? null
    const styles = parseStyles(r.offering.styles)
    return {
      key: r.id,
      kind: r.offering.type === 'EVENT' && ticket ? 'event' : 'class',
      title: r.offering.title,
      slug: r.offering.slug,
      businessName: r.offering.business.name,
      style: styles[0] ?? null,
      when: r.session?.startDateTime ?? r.offering.sessions[0]?.startDateTime ?? null,
      whenEnd: r.session?.endDateTime ?? r.offering.sessions[0]?.endDateTime ?? null,
      timeZone: r.offering.timeZone,
      venue: r.offering.venueName,
      status: r.status,
      ticketCode: ticket?.code ?? null,
      waitlistPosition: null,
      holdExpired:
        r.status === 'PENDING_PAYMENT' && r.order?.expiresAt
          ? r.order.expiresAt < now
          : false,
    }
  })

  const waitlistRows: BookingRow[] = waitlistEntries
    .filter((e) => e.session.startDateTime > now)
    .map((e) => {
      const styles = parseStyles(e.session.offering.styles)
      return {
        key: e.id,
        kind: 'class' as const,
        title: e.session.offering.title,
        slug: e.session.offering.slug,
        businessName: e.session.offering.business.name,
        style: styles[0] ?? null,
        when: e.session.startDateTime,
        whenEnd: e.session.endDateTime,
        timeZone: e.session.offering.timeZone,
        venue: e.session.offering.venueName,
        status: e.status,
        ticketCode: null,
        waitlistPosition: e.position,
        holdExpired: false,
      }
    })

  const upcoming = reservationRows.filter(
    (r) => r.when && r.when > now && r.status !== 'CANCELED'
  )
  const past = reservationRows.filter(
    (r) => (r.when && r.when <= now) || r.status === 'CANCELED'
  )
  const confirmed = upcoming.filter(
    (r) => r.status === 'CONFIRMED' || r.status === 'CHECKED_IN'
  )
  const pending = upcoming.filter((r) => r.status === 'PENDING_PAYMENT')
  const waitlisted = waitlistRows

  const hasAnything =
    confirmed.length + pending.length + waitlisted.length + past.length + packsRemaining.length > 0

  function formatExpiry(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    })
  }

  function RowCard({ row }: { row: BookingRow }) {
    const badge = STATUS_STYLE[row.status] ?? 'bg-gray-100 text-gray-800'
    const label = STATUS_LABEL[row.status] ?? row.status
    const isEvent = row.kind === 'event' && row.ticketCode
    return (
      <li className="bg-surface border border-gray-200 rounded-xl p-5 data-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">{row.title}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
              {row.style && (
                <>
                  <span
                    aria-hidden="true"
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getStyleColor(row.style) }}
                  />
                  {row.style}
                  <span aria-hidden="true">·</span>
                </>
              )}
              {row.businessName}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge}`}>
            {label}
          </span>
        </div>

        <dl className="mt-3 space-y-1 text-sm">
          {row.when && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-16 flex-shrink-0">When</dt>
              <dd className="text-gray-900 font-medium">
                {formatDateTime(row.when, row.timeZone)}
              </dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="text-gray-500 w-16 flex-shrink-0">Venue</dt>
            <dd className="text-gray-900 font-medium">{row.venue ?? '—'}</dd>
          </div>
          {row.waitlistPosition !== null && row.status === 'WAITLISTED' && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-16 flex-shrink-0">Queue</dt>
              <dd className="text-gray-900 font-medium">
                #{row.waitlistPosition} in line
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          {row.status === 'PROMOTED' && (
            <p className="text-sm font-medium text-blue-800 basis-full">
              A spot opened up — claim it within 24 hours.
            </p>
          )}
          {row.status === 'PENDING_PAYMENT' && row.holdExpired && (
            <p className="text-sm text-yellow-800 basis-full">
              The payment hold expired — book again from the class page.
            </p>
          )}
          {isEvent ? (
            <Link
              href={`/t/${row.ticketCode}`}
              className="font-medium text-accent-ink hover:underline"
            >
              View ticket →
            </Link>
          ) : (
            <Link
              href={`/o/${row.slug}`}
              className="font-medium text-accent-ink hover:underline"
            >
              {row.status === 'PROMOTED' ? 'Claim your spot →' : 'View offering →'}
            </Link>
          )}
          {isEvent && row.when && row.whenEnd && row.status !== 'CANCELED' && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href={googleCalendarUrl(row.title, row.when, row.whenEnd, row.venue ?? null)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-ink hover:underline"
            >
              Add to Google Calendar →
            </a>
          )}
        </div>
      </li>
    )
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-heading">My tickets &amp; reservations</h1>
          <p className="page-intro">Everything you've booked, in one place.</p>
        </div>
      </div>

      {!hasAnything ? (
        <div role="status" className="section-panel max-w-xl text-center py-12">
          <p className="text-lg font-bold text-primary">
            Nothing booked yet — the floor is waiting.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            Find a class or a social and grab your spot.
          </p>
          <Link
            href="/events"
            className="inline-block mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-dark hover:opacity-90 transition"
          >
            Browse events &amp; classes
          </Link>
        </div>
      ) : (
        <div className="max-w-2xl space-y-8">
          {packsRemaining.length > 0 && (
            <section aria-labelledby="packs-heading">
              <h2 id="packs-heading" className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                Class packs
              </h2>
              <ul role="list" className="space-y-4">
                {packsRemaining.map((p) => (
                  <li
                    key={p.id}
                    className="bg-surface border border-gray-200 rounded-xl p-5 data-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">{p.pack.name}</h3>
                        <p className="mt-1 text-sm text-gray-600">{p.business.name}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-accent-coral/15 text-accent-ink">
                        {p.creditsRemaining} {p.creditsRemaining === 1 ? 'class' : 'classes'} left
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-700">
                      Valid through {formatExpiry(p.expiresAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {confirmed.length > 0 && (
            <section aria-labelledby="confirmed-heading">
              <h2 id="confirmed-heading" className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                Confirmed
              </h2>
              <ul role="list" className="space-y-4">
                {confirmed.map((row) => (
                  <RowCard key={row.key} row={row} />
                ))}
              </ul>
            </section>
          )}

          {waitlisted.length > 0 && (
            <section aria-labelledby="waitlisted-heading">
              <h2 id="waitlisted-heading" className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                Waitlisted
              </h2>
              <ul role="list" className="space-y-4">
                {waitlisted.map((row) => (
                  <RowCard key={row.key} row={row} />
                ))}
              </ul>
            </section>
          )}

          {pending.length > 0 && (
            <section aria-labelledby="pending-heading">
              <h2 id="pending-heading" className="text-sm uppercase tracking-wide text-gray-500 mb-3">
                Payment pending
              </h2>
              <ul role="list" className="space-y-4">
                {pending.map((row) => (
                  <RowCard key={row.key} row={row} />
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <details className="section-panel">
              <summary className="cursor-pointer text-sm font-bold text-gray-900 select-none">
                Past ({past.length})
              </summary>
              <ul role="list" className="mt-4 space-y-4">
                {past.map((row) => (
                  <RowCard key={row.key} row={row} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </main>
  )
}
