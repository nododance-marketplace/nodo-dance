import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'
import { MapPin, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cities — Nodo Dance',
  description:
    'Partner dance events, classes and instructors in every city Nodo covers — Charlotte, Austin, Seattle and more.',
}

export default async function CitiesPage() {
  const now = new Date()

  const counts = await prisma.event.groupBy({
    by: ['city'],
    where: { status: 'APPROVED', startDateTime: { gte: now } },
    _count: { _all: true },
  })
  const byCity = new Map(counts.map((c) => [c.city ?? '', c._count._all]))

  const markets = MARKETS.map((m) => ({
    ...m,
    events: m.cities.reduce((sum, city) => sum + (byCity.get(city) ?? 0), 0),
  })).sort((a, b) => b.events - a.events)

  const live = markets.filter((m) => m.events > 0)
  const soon = markets.filter((m) => m.events === 0)

  return (
    <div className="page-shell">
      <section className="mb-10">
        <h1 className="page-heading mb-3">Cities</h1>
        <p className="page-intro max-w-2xl">
          Nodo maps the partner dance scene city by city. Pick where you are — or where you are heading.
        </p>
      </section>

      <section className="mb-14">
        <h2 className="text-2xl font-bold mb-6">Live now</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {live.map((m) => (
            <Link
              key={m.slug}
              href={`/cities/${m.slug}`}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:border-gray-300 transition-colors group"
            >
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
                {m.state}
              </div>
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                {m.name}
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
              </h3>
              <p className="text-sm text-gray-600 mb-3">{m.tagline}</p>
              <span className="text-sm font-medium text-primary">
                {m.events} upcoming event{m.events === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {soon.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-2">Opening soon</h2>
          <p className="text-gray-600 mb-6">
            These markets are being set up. If you dance in one of them, we would love to hear from you.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {soon.map((m) => (
              <div key={m.slug} className="bg-white border border-gray-200 rounded-xl p-5 opacity-70">
                <h3 className="font-semibold mb-1">{m.name}, {m.state}</h3>
                <p className="text-sm text-gray-500">{m.tagline}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
