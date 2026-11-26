import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SOURCE_LABEL: Record<string, string> = {
  ACCOUNT: 'account',
  DROPIN: 'drop-in',
  PACK: 'pack',
  WAITLIST: 'waitlist',
}

type Range = '30d' | 'all'

function money(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`
}

/**
 * Organizer reporting (M3). Everything is computed server-side from the raw
 * rows — no page-view tracking exists per offering, so the numbers are the
 * operational ones: upcoming sessions, confirmed bookings, booking-source
 * split, attendance (checked-in ÷ confirmed bookings on started sessions) and
 * revenue (PAID orders; refunds drop out). Staff of the business get read
 * access; anyone else 404s.
 */
export default async function ReportingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { slug } = await params
  const { range: rangeParam } = await searchParams
  const range: Range = rangeParam === 'all' ? 'all' : '30d'

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

  const now = new Date()
  const windowStart = range === '30d' ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : null

  const offerings = await prisma.offering.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      price: true,
      sessions: { select: { id: true, startDateTime: true, status: true } },
    },
  })
  const offeringIds = offerings.map((o) => o.id)

  // Raw rows for the window, aggregated per offering below. Reservations/orders
  // are windowed by when they were made; upcoming sessions are always future.
  const reservations = offeringIds.length
    ? await prisma.reservation.findMany({
        where: {
          offeringId: { in: offeringIds },
          ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
        },
        select: { offeringId: true, sessionId: true, source: true, status: true },
      })
    : []
  const paidOrders = offeringIds.length
    ? await prisma.order.findMany({
        where: {
          offeringId: { in: offeringIds },
          status: 'PAID',
          ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
        },
        select: { offeringId: true, amount: true },
      })
    : []

  // sessionId -> startDateTime, for the attendance window (started sessions only)
  const sessionStart = new Map<string, Date>()
  for (const o of offerings) {
    for (const s of o.sessions) sessionStart.set(s.id, s.startDateTime)
  }

  type Row = {
    title: string
    type: string
    upcomingSessions: number
    confirmed: number
    pack: number
    account: number
    dropin: number
    waitlist: number
    attended: number
    confirmedPast: number // denominator: confirmed bookings on sessions that started
    revenue: number
  }

  const rows = new Map<string, Row>()
  const rowFor = (offeringId: string, title: string, type: string): Row => {
    let row = rows.get(offeringId)
    if (!row) {
      row = {
        title,
        type,
        upcomingSessions: 0,
        confirmed: 0,
        pack: 0,
        account: 0,
        dropin: 0,
        waitlist: 0,
        attended: 0,
        confirmedPast: 0,
        revenue: 0,
      }
      rows.set(offeringId, row)
    }
    return row
  }

  for (const o of offerings) {
    const row = rowFor(o.id, o.title, o.type)
    row.upcomingSessions = o.sessions.filter(
      (s) => s.status === 'SCHEDULED' && s.startDateTime > now
    ).length
  }

  const ACTIVE = ['CONFIRMED', 'CHECKED_IN', 'NO_SHOW']
  for (const r of reservations) {
    if (!r.offeringId || r.status === 'CANCELED' || r.status === 'PENDING_PAYMENT') continue
    const o = offerings.find((x) => x.id === r.offeringId)
    if (!o) continue
    const row = rowFor(r.offeringId, o.title, o.type)
    if (r.status === 'CONFIRMED' || r.status === 'CHECKED_IN') row.confirmed++
    if (r.source === 'PACK') row.pack++
    else if (r.source === 'WAITLIST') row.waitlist++
    else if (r.source === 'DROPIN') row.dropin++
    else row.account++

    // Attendance only counts sessions that already happened (inside the window)
    const start = r.sessionId ? sessionStart.get(r.sessionId) : undefined
    if (start && start <= now && (!windowStart || start >= windowStart)) {
      if (r.status === 'CHECKED_IN') row.attended++
      if (ACTIVE.includes(r.status)) row.confirmedPast++
    }
  }

  for (const order of paidOrders) {
    const o = offerings.find((x) => x.id === order.offeringId)
    if (!o) continue
    rowFor(order.offeringId, o.title, o.type).revenue += order.amount
  }

  const tableRows = [...rows.entries()]
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => Number(b.upcomingSessions > 0) - Number(a.upcomingSessions > 0))

  const totals = tableRows.reduce(
    (acc, r) => ({
      upcoming: acc.upcoming + r.upcomingSessions,
      confirmed: acc.confirmed + r.confirmed,
      attended: acc.attended + r.attended,
      confirmedPast: acc.confirmedPast + r.confirmedPast,
      revenue: acc.revenue + r.revenue,
      pack: acc.pack + r.pack,
      account: acc.account + r.account,
      dropin: acc.dropin + r.dropin,
      waitlist: acc.waitlist + r.waitlist,
    }),
    { upcoming: 0, confirmed: 0, attended: 0, confirmedPast: 0, revenue: 0, pack: 0, account: 0, dropin: 0, waitlist: 0 }
  )
  const totalRate = totals.confirmedPast > 0 ? Math.round((totals.attended / totals.confirmedPast) * 100) : null
  const totalBookings = totals.pack + totals.account + totals.dropin + totals.waitlist

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="text-sm text-gray-600">
            <Link href={`/manage/${slug}`} className="hover:text-primary hover:underline">
              {business.name}
            </Link>
            <span aria-hidden="true"> / Reporting</span>
          </p>
          <h1 className="page-heading">Reporting</h1>
          <p className="page-intro">
            Bookings, attendance and revenue per offering — computed from your
            live data, {range === '30d' ? 'last 30 days' : 'all time'}.
          </p>
        </div>
      </div>

      {/* Range toggle */}
      <nav aria-label="Reporting range" className="max-w-4xl flex gap-2 text-sm">
        <Link
          href={`/manage/${slug}/reporting?range=30d`}
          aria-current={range === '30d' ? 'page' : undefined}
          className={`px-4 py-1.5 rounded-full font-medium ${
            range === '30d' ? 'bg-primary text-primary-dark' : 'bg-surface border border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          Last 30 days
        </Link>
        <Link
          href={`/manage/${slug}/reporting?range=all`}
          aria-current={range === 'all' ? 'page' : undefined}
          className={`px-4 py-1.5 rounded-full font-medium ${
            range === 'all' ? 'bg-primary text-primary-dark' : 'bg-surface border border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          All time
        </Link>
      </nav>

      {/* Summary cards */}
      <section aria-labelledby="totals-heading" className="max-w-4xl mt-6">
        <h2 id="totals-heading" className="sr-only">Totals</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface border border-gray-200 rounded-xl p-4 data-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">Confirmed bookings</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totals.confirmed}</p>
          </div>
          <div className="bg-surface border border-gray-200 rounded-xl p-4 data-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">Upcoming sessions</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{totals.upcoming}</p>
          </div>
          <div className="bg-surface border border-gray-200 rounded-xl p-4 data-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">Revenue (paid)</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{money(totals.revenue)}</p>
          </div>
          <div className="bg-surface border border-gray-200 rounded-xl p-4 data-card">
            <p className="text-xs uppercase tracking-wide text-gray-500">Attendance</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {totalRate === null ? '—' : `${totalRate}%`}
            </p>
          </div>
        </div>
      </section>

      {tableRows.length === 0 ? (
        <div role="status" className="section-panel max-w-4xl text-center py-10 mt-8">
          <p className="text-sm font-medium text-gray-800">Nothing to report yet</p>
          <p className="mt-1 text-sm text-gray-600">
            Numbers appear here once you have offerings and bookings.
          </p>
        </div>
      ) : (
        <section aria-labelledby="per-offering-heading" className="max-w-4xl mt-8">
          <h2 id="per-offering-heading" className="text-xl font-bold text-primary mb-4">
            Per offering
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="py-2 pr-4 font-medium">Offering</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Upcoming</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Confirmed</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Pack</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Account</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Drop-in</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Waitlist</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Attendance</th>
                  <th scope="col" className="py-2 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tableRows.map((r) => {
                  const rate = r.confirmedPast > 0 ? Math.round((r.attended / r.confirmedPast) * 100) : null
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4">
                        <span className="block font-medium text-gray-900">{r.title}</span>
                        <span className="block text-xs text-gray-500">{r.type === 'CLASS' ? 'Class' : 'Event'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.upcomingSessions}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{r.confirmed}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.pack}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.account}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.dropin}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{r.waitlist}</td>
                      <td className="py-2.5 pr-4 text-gray-700">{rate === null ? '—' : `${rate}%`}</td>
                      <td className="py-2.5 font-medium text-gray-900">{money(r.revenue)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Attendance is checked-in ÷ confirmed bookings on sessions that
            already started. Revenue counts PAID orders; refunds drop out.
            Source split: {SOURCE_LABEL.PACK} / {SOURCE_LABEL.ACCOUNT} / {SOURCE_LABEL.DROPIN} / {SOURCE_LABEL.WAITLIST} bookings
            {totalBookings > 0 ? ` (${totalBookings} in this range)` : ''}.
          </p>
        </section>
      )}
    </main>
  )
}
