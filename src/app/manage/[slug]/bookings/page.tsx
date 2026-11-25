import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RosterActions } from './roster-actions'

export const dynamic = 'force-dynamic'

function formatSession(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: 'bg-gray-100 text-gray-800',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  CHECKED_IN: 'bg-green-100 text-green-800',
  NO_SHOW: 'bg-red-100 text-red-800',
  CANCELED: 'bg-gray-100 text-gray-500',
  WAITLISTED: 'bg-blue-100 text-blue-800',
}

const SOURCE_LABEL: Record<string, string> = {
  ACCOUNT: 'account',
  DROPIN: 'drop-in',
  PACK: 'pack',
  WAITLIST: 'waitlist',
}

/**
 * Class roster (M2): upcoming sessions with their reservations — name, email,
 * status, source — plus no-show marking. Staff of the business (OWNER /
 * INSTRUCTOR / CHECKIN) get in; anyone else 404s.
 */
export default async function BookingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

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

  // Sessions from yesterday onward so staff can mark no-shows after class
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const sessions = await prisma.classSession.findMany({
    where: {
      offering: { businessId: business.id, type: 'CLASS' },
      startDateTime: { gte: since },
    },
    orderBy: { startDateTime: 'asc' },
    take: 30,
    include: {
      offering: { select: { title: true, capacity: true } },
      reservations: { orderBy: { createdAt: 'asc' } },
    },
  })

  // Reservation.user is a bare id column (M1) — resolve names/emails in one go
  const userIds = sessions
    .flatMap((s) => s.reservations.map((r) => r.userId))
    .filter((id): id is string => Boolean(id))
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userById = new Map(users.map((u) => [u.id, u]))

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <p className="text-sm text-gray-600">
            <Link href={`/manage/${slug}`} className="hover:text-primary hover:underline">
              {business.name}
            </Link>
            <span aria-hidden="true"> / Bookings</span>
          </p>
          <h1 className="page-heading">Class roster</h1>
          <p className="page-intro">
            Reservations per session — mark no-shows after class.
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div role="status" className="section-panel max-w-3xl text-center py-10">
          <p className="text-sm font-medium text-gray-800">No upcoming sessions</p>
          <p className="mt-1 text-sm text-gray-600">
            Rosters appear here once your classes have sessions on the schedule.
          </p>
        </div>
      ) : (
        <ul role="list" className="max-w-3xl space-y-6">
          {sessions.map((s) => {
            const active = s.reservations.filter(
              (r) => r.status !== 'CANCELED' && r.status !== 'PENDING_PAYMENT'
            )
            const holds = s.reservations.filter((r) => r.status === 'PENDING_PAYMENT')
            const capacity = s.capacityOverride ?? s.offering.capacity
            return (
              <li key={s.id} className="bg-surface border border-gray-200 rounded-xl p-5 data-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-gray-900">{s.offering.title}</h2>
                  <p className="text-sm text-gray-600">
                    {formatSession(s.startDateTime)}
                    {s.status === 'CANCELED' && (
                      <span className="ml-2 font-bold text-[var(--color-error)]">Canceled</span>
                    )}
                  </p>
                </div>
                <p className="mt-1 text-sm text-gray-700">
                  {active.length} / {capacity} booked
                  {holds.length > 0 && ` · ${holds.length} paying now`}
                </p>

                {active.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500">No reservations yet.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Email</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                          <th scope="col" className="py-2 pr-4 font-medium">Source</th>
                          <th scope="col" className="py-2 font-medium">Mark</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {active.map((r) => {
                          const account = r.userId ? userById.get(r.userId) : null
                          const name =
                            account?.name ??
                            r.guestName ??
                            account?.email ??
                            r.guestEmail ??
                            '—'
                          const email = account?.email ?? r.guestEmail ?? '—'
                          return (
                            <tr key={r.id}>
                              <td className="py-2.5 pr-4 font-medium text-gray-900">{name}</td>
                              <td className="py-2.5 pr-4 text-gray-700">{email}</td>
                              <td className="py-2.5 pr-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {r.status.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 text-gray-600">
                                {SOURCE_LABEL[r.source] ?? r.source}
                              </td>
                              <td className="py-2.5">
                                <RosterActions
                                  slug={slug}
                                  reservationId={r.id}
                                  status={r.status}
                                />
                              </td>
                            </tr>
                          )
                        })}
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
