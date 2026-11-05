import Link from 'next/link'
import type { Metadata } from 'next'
import { marketSummaries } from '@/lib/markets-server'
import { MapPin, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cities — Nodo Dance',
  description:
    'Partner dance events, classes and instructors in every city Nodo covers — Charlotte, Austin, Seattle and more.',
}

export default async function CitiesPage() {
  const markets = await marketSummaries()

  const live = markets.filter((m) => m.events > 0).sort((a, b) => b.events - a.events)
  const soon = markets.filter((m) => m.events === 0)

  // Group the ones still opening by state, so the page reads as a map of the
  // country rather than a list.
  const byState = new Map<string, typeof soon>()
  for (const m of soon) {
    if (!byState.has(m.state)) byState.set(m.state, [])
    byState.get(m.state)!.push(m)
  }

  const totalEvents = live.reduce((sum, m) => sum + m.events, 0)

  return (
    <div className="page-shell">
      <section className="mb-10">
        <h1 className="page-heading mb-3">Cities</h1>
        <p className="page-intro max-w-2xl">
          Nodo maps the partner dance scene city by city. Pick where you are — or where you
          are heading. {live.length} {live.length === 1 ? 'city has' : 'cities have'} events
          right now, across {new Set(live.map((m) => m.state)).size} states.
        </p>
      </section>

      {live.length > 0 && (
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
                {m.tagline && <p className="text-sm text-gray-600 mb-3">{m.tagline}</p>}
                <span className="text-sm font-medium text-primary">
                  {m.events} upcoming event{m.events === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {soon.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-2">Opening soon</h2>
          <p className="text-gray-600 mb-6 max-w-2xl">
            These are the places we are covering. If you dance in one of them, we want your
            events on it — and if a studio runs socials there, the page is where people will
            find you.
          </p>

          {[...byState.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([state, towns]) => (
              <div key={state} className="mb-10">
                <h3 className="font-semibold text-gray-700 mb-4">{state}</h3>
                <div className="flex flex-wrap gap-3">
                  {towns.map((m) => (
                    <Link
                      key={m.slug}
                      href={`/cities/${m.slug}`}
                      className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 hover:border-gray-300 transition-colors"
                    >
                      <span className="font-medium text-sm">{m.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}
    </div>
  )
}
