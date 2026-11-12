'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getStyleColor } from '@/lib/styleColors'
import { formatDate, formatTime, parseJsonArray } from '@/lib/utils'
import {
  applyJitter,
  getEventTypeShape,
  makeSvg,
  MapErrorBoundary,
  type MapEvent,
} from '@/components/events/events-map-view'

/**
 * The homepage map demo. Same pins, same shapes, same jitter as the events
 * page — the product shown, not a screenshot of it.
 *
 * The tour picks the 3–4 pins farthest from each other and flies between
 * them, pausing on each. One pointerdown/wheel/touch on the map ends the
 * tour for good; the map then belongs to the visitor. Everything waits
 * until the section is actually on screen, and skips entirely under
 * prefers-reduced-motion.
 */
const TOUR_ZOOM = 12
const FIT_MAX_ZOOM = 11
const FIRST_STOP_DELAY_MS = 2200
const STOP_MS = 3400

function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)
  const dy = a.lat - b.lat
  return dx * dx + dy * dy
}

/** Greedy farthest-point selection: pins that show the spread of the scene. */
function pickTourStops(events: MapEvent[], count: number): MapEvent[] {
  if (events.length <= count) return events
  const picked = [events[0]]
  while (picked.length < count) {
    let best: MapEvent | null = null
    let bestD = -1
    for (const e of events) {
      if (picked.includes(e)) continue
      const d = Math.min(...picked.map((p) => distance(p, e)))
      if (d > bestD) {
        bestD = d
        best = e
      }
    }
    if (!best || bestD === 0) break
    picked.push(best)
  }
  return picked
}

function FitBounds({ events }: { events: MapEvent[] }) {
  const map = useMap()

  useEffect(() => {
    if (events.length === 0) return
    const bounds = L.latLngBounds(events.map((e) => [e.lat, e.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: FIT_MAX_ZOOM })
  }, [events, map])

  return null
}

function TourController({ stops }: { stops: MapEvent[] }) {
  const map = useMap()

  useEffect(() => {
    if (stops.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const container = map.getContainer()
    let index = 0
    let timer: number | undefined
    let stopped = false
    let seen = false
    let cleanupObserver: (() => void) | undefined = undefined

    const stop = () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
      container.removeEventListener('pointerdown', stop)
      container.removeEventListener('wheel', stop)
      container.removeEventListener('touchstart', stop)
    }

    const advance = () => {
      if (stopped) return
      const spot = stops[index % stops.length]
      index += 1
      map.flyTo([spot.lat, spot.lng], TOUR_ZOOM, { duration: 2.6, easeLinearity: 0.18 })
      timer = window.setTimeout(advance, FIRST_STOP_DELAY_MS + 2600 + STOP_MS)
    }

    const wake = () => {
      if (seen) return
      seen = true
      container.classList.add('map-demo-live')
      timer = window.setTimeout(advance, FIRST_STOP_DELAY_MS)
    }

    if (typeof IntersectionObserver === 'undefined') {
      wake()
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return
          observer.disconnect()
          wake()
        },
        { threshold: 0.45 }
      )
      observer.observe(container)
      cleanupObserver = () => observer.disconnect()
    }

    container.addEventListener('pointerdown', stop, { passive: true })
    container.addEventListener('wheel', stop, { passive: true })
    container.addEventListener('touchstart', stop, { passive: true })

    return () => {
      cleanupObserver?.()
      stop()
    }
  }, [map, stops])

  return null
}

/** Same pin art as the events page, wrapped so the one-time pulse can scale
 * the art without fighting Leaflet's own transform on the icon element. */
function makeDemoPin(color: string, shape: ReturnType<typeof getEventTypeShape>): L.DivIcon {
  return L.divIcon({
    className: 'map-demo-pin',
    html: `<span class="map-demo-pin-inner">${makeSvg(color, shape)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

export default function MapDemoMap({ events }: { events: MapEvent[] }) {
  const jittered = useMemo(() => applyJitter(events), [events])
  const stops = useMemo(() => pickTourStops(jittered, 4), [jittered])

  return (
    <MapErrorBoundary>
      <MapContainer
        center={[35.2271, -80.8431]}
        zoom={FIT_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds events={events} />
        <TourController stops={stops} />
        {jittered.map((event) => {
          const color = getStyleColor(event.styles)
          const icon = makeDemoPin(color, getEventTypeShape(event.eventType))
          const start = typeof event.startDateTime === 'string' ? new Date(event.startDateTime) : event.startDateTime

          return (
            <Marker key={event.id} position={[event.jLat, event.jLng]} icon={icon}>
              <Popup>
                <div className="text-sm min-w-44">
                  <p className="font-bold">{event.title}</p>
                  <p className="text-xs text-gray-500">{parseJsonArray(event.styles).join(', ') || 'Open social'}</p>
                  <p className="text-gray-600">{event.venueName}</p>
                  <p className="text-gray-700 mt-1">
                    {formatDate(start)} · {formatTime(start)}
                  </p>
                  <a href={`/events/${event.id}`} className="text-primary hover:underline text-xs mt-1 inline-block">
                    Details
                  </a>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </MapErrorBoundary>
  )
}
