import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RefundButton } from './refund-button'

export const dynamic = 'force-dynamic'

const TICKET_STYLE: Record<string, string> = {
  ISSUED: 'bg-gray-100 text-gray-800',
  CHECKED_IN: 'bg-green-100 text-green-800',
  REFUNDED: 'bg-red-100 text-red-800',
  CANCELED: 'bg-gray-100 text-gray-500',
}

const ORDER_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'paying now',
  PAID: 'paid',
  REFUNDED: 'refunded',
  CANCELED: 'canceled',
}

/**
 * Event guest list (M2): ticket codes, holder, tier, order status — plus CSV
 * export and refunds for paid orders. Staff of the business (OWNER /
 * INSTRUCTOR / CHECKIN) get in; anyone else 404s.
 */
export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ offering?: string }>
}) {
  const { slug } = await params
  const { offering: offeringFilter } = await searchParams

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/auth/signin')

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) redirect('/auth/signin')

  const business = await prisma.business.findFirst({
    where: { slug, members: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })
  if (!business) notFound()

  const events = await prisma.offering.findMany({
    where: {
      businessId: business.id,
      type: 'EVENT',
      ...(offeringFilter ? { id: offeringFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      sessions: { orderBy: { startDateTime: 'asc' }, take: 1 },
    },
  })

  // Ticket.offeringId is a bare column (no relation) — fetch per event and group
  const ticketRows = await prisma.ticket.findMany({
    where: { offeringId: { in: events.map((e) => e.id) } },
    orderBy: { createdAt: 'asc' },
    include: { tier: { select: { name: true } }, order: true },
  })
  const ticketsByEvent = new Map<string, typeof ticketRows>()
  for (const t of ticketRows) {
    const list = ticketsByEvent.get(t.offeringId) ?? []
    list.push(t)
    ticketsByEvent.set(t.offeringId, list)
  }

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="text-sm text-gray-600">
            <Link href={`/manage/${slug}`} className="hover:text-primary hover:underline">
              {business.name}
            </Link>
            <span aria-hidden="true"> / Guests</span>
          </p>
          <h1 className="page-heading">Guest lists</h1>
          <p className="page-intro">
            Tickets per event — export the door list or refund an order.
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <div role="status" className="section-panel max-w-3xl text-center py-10">
          <p className="text-sm font-medium text-gray-800">No events yet</p>
          <p className="mt-1 text-sm text-gray-600">
            Guest lists appear here once you create an event.
          </p>
        </div>
      ) : (
        <ul role="list" className="max-w-3xl space-y-6">
          {events.map((event) => {
            const when = event.sessions[0]?.startDateTime
            const tickets = ticketsByEvent.get(event.id) ?? []
            const sold = tickets.filter((t) => t.status !== 'CANCELED').length
            return (
              <li key={event.id} className="bg-surface border border-gray-200 rounded-xl p-5 data-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-gray-900">{event.title}</h2>
                  <p className="text-sm text-gray-600">
                    {when
                      ? when.toLocaleString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          timeZone: 'America/New_York',
                        })
                      : 'No date'}
                    {event.status === 'CANCELED' && (
                      <span className="ml-2 font-bold text-[var(--color-error)]">Canceled</span>
                    )}
                  </p>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                  <span>{sold} {sold === 1 ? 'ticket' : 'tickets'}</span>
                  <Link
                    href={`/api/manage/${slug}/guests/export?offeringId=${event.id}`}
                    prefetch={false}
                    className="font-medium text-accent-ink hover:underline"
                  >
                    Export CSV ↓
                  </Link>
                </p>

                {tickets.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">No tickets issued yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th scope="col" className="py-2 pr-4 font-medium">Code</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Guest</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Tier</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Ticket</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Order</th>
                          <th scope="col" className="py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tickets.map((t) => (
                          <tr key={t.id}>
                            <td className="py-2.5 pr-4 font-mono font-medium text-gray-900">
                              {t.code}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span className="block font-medium text-gray-900">
                                {t.holderName ?? '—'}
                              </span>
                              <span className="block text-gray-600">{t.holderEmail}</span>
                            </td>
                            <td className="py-2.5 pr-4 text-gray-700">{t.tier?.name ?? 'GA'}</td>
                            <td className="py-2.5 pr-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  TICKET_STYLE[t.status] ?? 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {t.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-gray-700">
                              {t.order
                                ? `${ORDER_LABEL[t.order.status] ?? t.order.status} · $${t.order.amount % 1 === 0 ? t.order.amount.toFixed(0) : t.order.amount.toFixed(2)}`
                                : 'free'}
                            </td>
                            <td className="py-2.5">
                              {t.order?.status === 'PAID' && (
                                <RefundButton slug={slug} orderId={t.order.id} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
