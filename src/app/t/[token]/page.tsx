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
 * Ticket / confirmation view keyed by the guest's secure token. Resolves, in
 * order:
 *  1. a Ticket (events — free RSVP and paid, issued by the webhook);
 *  2. a Reservation (guest class bookings);
 *  3. an Order (M2 paid checkout before the webhook lands — shows "processing
 *     payment"; refunded shows a refund banner).
 * A bad or unknown token is a plain 404. Guests arrive with their 48-char
 * secure token; signed-in dancers can also open their own ticket by its
 * NODO- code from /my-tickets (the code is the door secret anyway).
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const isTicketCode = /^NODO-[A-F0-9]{8}$/i.test(token)
  if (!isTicketCode && !/^[a-f0-9]{48}$/.test(token)) notFound()

  // Tickets exist for events; guest class reservations only have a Reservation.
  // Ticket has no relation to Offering (id column only), so it is fetched after.
  const ticket = await prisma.ticket.findFirst({
    where: isTicketCode ? { code: token.toUpperCase() } : { guestToken: token },
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

  // M2: a paid checkout creates the Order first — /t/{token} shows the
  // processing state until the webhook flips it and issues the ticket or
  // confirms the reservation (both carry this same token).
  const order =
    ticket || reservation
      ? null
      : await prisma.order.findUnique({
          where: { guestToken: token },
          include: {
            offering: {
              include: {
                business: { select: { name: true, slug: true } },
                sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
              },
            },
            tier: true,
            session: true,
          },
        })

  if (!ticket && !reservation && !order) notFound()

  const offeringRow = ticket
    ? await prisma.offering.findUnique({
        where: { id: ticket.offeringId },
        include: {
          business: { select: { name: true, slug: true } },
          sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
        },
      })
    : reservation
      ? reservation.offering
      : order!.offering
  if (!offeringRow) notFound()
  const offering = offeringRow

  const eventSession = offering.sessions[0] ?? null
  const classSession = reservation?.session ?? order?.session ?? null
  const when = classSession
    ? classSession.startDateTime
    : eventSession?.startDateTime
  const whenEnd = classSession ? classSession.endDateTime : eventSession?.endDateTime
  const holderName =
    ticket?.holderName ?? order?.guestName ?? reservation?.guestName ?? null
  const holderEmail =
    ticket?.holderEmail ?? order?.guestEmail ?? reservation?.guestEmail ?? null

  const canceled =
    (classSession && classSession.status === 'CANCELED') ||
    (eventSession && eventSession.status === 'CANCELED') ||
    reservation?.status === 'CANCELED'
  const refunded = ticket?.status === 'REFUNDED' || order?.status === 'REFUNDED'
  // Paid hold waiting on the webhook — also what a success_url return shows
  const processing =
    !canceled &&
    !refunded &&
    (reservation?.status === 'PENDING_PAYMENT' ||
      order?.status === 'PENDING_PAYMENT')
  const holdExpired =
    processing && order?.expiresAt !== null && order?.expiresAt !== undefined
      ? order.expiresAt < new Date()
      : false

  const statusLabel = canceled
    ? 'Canceled'
    : refunded
      ? 'Refunded'
      : processing
        ? 'Processing'
        : ticket
          ? 'Ticket code'
          : 'Confirmed'

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
          {order?.tier ? ` · ${order.tier.name}` : ''}
        </p>

        {refunded && (
          <div
            role="alert"
            className="mt-6 bg-surface border border-[var(--color-error)] rounded-xl p-5"
          >
            <p className="font-bold text-[var(--color-error)]">
              This ticket was refunded
            </p>
            <p className="mt-1 text-sm text-gray-700">
              The payment was returned and this ticket no longer admits entry.
              Contact the organizer if you think this is a mistake.
            </p>
          </div>
        )}

        <div className="mt-8 bg-surface border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-6 sm:p-8 text-center border-b border-dashed border-gray-200">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {statusLabel}
            </p>
            {canceled ? (
              <p className="mt-2 text-2xl font-bold text-[var(--color-error)]">
                Canceled
              </p>
            ) : refunded ? (
              <p className="mt-2 text-2xl font-bold text-[var(--color-error)]">
                Refunded
              </p>
            ) : processing ? (
              <>
                <p className="mt-2 text-2xl font-bold text-primary">
                  Processing payment…
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  {holdExpired
                    ? 'This payment hold expired — if you were charged, your booking is still being confirmed. Refresh in a moment.'
                    : 'Your payment is being confirmed — usually a few seconds. Refresh this page to see your ticket.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-3xl font-bold text-primary tracking-wide">
                {ticket ? ticket.code : 'Confirmed ✓'}
              </p>
            )}
            {!canceled && !refunded && !processing && (
              <p className="mt-2 text-xs text-gray-500">
                {ticket
                  ? 'Show this code at the door.'
                  : 'No ticket needed for classes — just check in with your name.'}
              </p>
            )}
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
            {order && (
              <div>
                <dt className="text-gray-500">Amount</dt>
                <dd className="mt-0.5 text-gray-900 font-medium">
                  ${order.amount % 1 === 0 ? order.amount.toFixed(0) : order.amount.toFixed(2)}{' '}
                  {order.currency.toUpperCase()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {!canceled && !refunded && !processing && when && whenEnd && (
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
