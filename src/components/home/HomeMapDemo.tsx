'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import type { MapEvent } from '@/components/events/events-map-view'

/**
 * The homepage's live-map section. The Leaflet bundle is the heaviest thing
 * on this page, so the map itself is a lazy client island: everything around
 * it (headline, overlay, CTA) renders on the server, and the map hydrates
 * below the fold without touching LCP.
 */
const MapDemoMap = dynamic(() => import('@/components/home/MapDemoMap'), {
  ssr: false,
  loading: () => <div className="home-map-loading" aria-hidden="true" />,
})

export function HomeMapDemo({ events, marketName }: { events: MapEvent[]; marketName: string }) {
  if (events.length === 0) return null

  return (
    <section className="home-section">
      <div className="home-container">
        <div className="home-section-head">
          <div>
            <h2>The scene, <em>live</em>.</h2>
            <p>Real pins from the events page — every social we have for {marketName.toLowerCase()}, right now.</p>
          </div>
        </div>
        <div className="home-map-demo">
          <MapDemoMap events={events} />
          <div className="home-map-overlay">
            <p className="home-map-caption">
              Every social in <em>every</em> city we&apos;ve mapped.
            </p>
            <Link href="/events" className="home-map-cta">
              see what&apos;s on <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
