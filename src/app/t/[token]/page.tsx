import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function formatDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
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

/**
 * Ticket / confirmation view keyed by the guest's secure token. Works for both
 * free-event tickets (Ticket row) and guest class reservations (Reservation
 * row carries its own token). A bad or unknown token is a plain 404.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!/^[a-f0-9]{48}$/.test(token)) notFound()

  // Tickets exist for events; guest class reservations only have a Reservation.
  // Ticket has no relation to Offering (id column only), so it is fetched after.
  const ticket = await prisma.ticket.findFirst({
    where: { guestToken: token },
  })

  const reservation = ticket
    ? null
    : await prisma.reservation.findFirst({
        where: { guestToken: token },
        include: {
          offering: {
            include: {
              business: { select: { name: true, slug: true } },
              sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
            },
          },
          session: true,
        },
      })

  if (!ticket && !reservation) notFound()

  const offeringId = ticket ? ticket.offeringId : reservation!.offeringId
  const offering = await prisma.offering.findUnique({
    where: { id: offeringId },
    include: {
      business: { select: { name: true, slug: true } },
      sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
    },
  })
  if (!offering) notFound()

  const eventSession = offering.sessions[0] ?? null
  const classSession = reservation?.session ?? null
  const when = classSession ? classSession.startDateTime : eventSession?.startDateTime
  const whenEnd = classSession ? classSession.endDateTime : eventSession?.endDateTime
  const holderName = ticket?.holderName ?? reservation?.guestName ?? null
  const holderEmail = ticket?.holderEmail ?? reservation?.guestEmail ?? null
  const canceled =
    (classSession && classSession.status === 'CANCELED') ||
    (eventSession && eventSession.status === 'CANCELED') ||
    reservation?.status === 'CANCELED'

  return (
    <main className="page-shell">
      <div className="max-w-xl mx-auto">
        <p className="text-sm text-gray-600">
          <Link
            href={`/manage/${offering.business.slug}`}
            className="font-medium text-accent-ink hover:underline"
          >
            {offering.business.name}
          </Link>
        </p>

        <h1 className="mt-2 text-4xl font-bold text-primary leading-tight">
          {offering.title}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {offering.type === 'CLASS' ? 'Class confirmation' : 'Your ticket'}
        </p>

        <div className="mt-8 bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-6 sm:p-8 text-center border-b border-dashed border-gray-200">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {canceled ? 'Status' : offering.type === 'CLASS' ? 'Confirmed' : 'Ticket code'}
            </p>
            {canceled ? (
              <p className="mt-2 text-2xl font-bold text-[var(--color-error)]">
                Canceled
              </p>
            ) : (
              <p className="mt-2 text-3xl font-bold text-primary tracking-wide">
                {ticket ? ticket.code : 'Confirmed ✓'}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              {ticket
                ? 'Show this code at the door.'
                : 'No ticket needed for classes — just check in with your name.'}
            </p>
          </div>

          <dl className="p-6 sm:p-8 space-y-4 text-sm">
            {when && (
              <div>
                <dt className="text-gray-500">When</dt>
                <dd className="mt-0.5 text-gray-900 font-medium">{formatDateTime(when)}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Venue</dt>
              <dd className="mt-0.5 text-gray-900 font-medium">{offering.venueName ?? '—'}</dd>
            </div>
            {holderName && (
              <div>
                <dt className="text-gray-500">Ticket holder</dt>
                <dd className="mt-0.5 text-gray-900 font-medium">{holderName}</dd>
              </div>
            )}
            {holderEmail && (
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="mt-0.5 text-gray-900 font-medium">{holderEmail}</dd>
              </div>
            )}
          </dl>
        </div>

        {when && whenEnd && (
          <p className="mt-6 text-center">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href={googleCalendarUrl(
                offering.title,
                when,
                whenEnd,
                offering.venueName ?? null
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-ink hover:underline"
            >
              Add to Google Calendar →
            </a>
          </p>
        )}

        <p className="mt-10 text-center text-xs text-gray-500">
          Keep this link — it is your proof of booking.
        </p>
      </div>
    </main>
  )
}
