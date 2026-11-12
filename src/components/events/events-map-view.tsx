'use client'

import { Component, useEffect, useMemo, type ReactNode } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { parseJsonArray, formatDate, formatTime } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'
import { DANCE_STYLE_COLORS, getStyleColor } from '@/lib/styleColors'

/**
 * Leaflet binds itself to one DOM node for life. In dev, StrictMode's
 * mount-unmount-mount cycle and Fast Refresh can hand it back a node that
 * already holds a map. Catch that and remount on a fresh container.
 */
export class MapErrorBoundary extends Component<{ children: ReactNode }, { epoch: number; failed: boolean }> {
  state = { epoch: 0, failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    if (String(error).includes('already initialized')) {
      this.setState((s) => ({ epoch: s.epoch + 1, failed: false }))
    }
  }

  render() {
    if (this.state.failed) {
      return <div className="bg-surface rounded-xl h-[520px] flex items-center justify-center text-gray-500 text-sm">Map could not load. Refresh the page.</div>
    }
    return <div key={this.state.epoch}>{this.props.children}</div>
  }
}

// --- Event type → marker shape ---
type PinShape = 'circle' | 'ring' | 'square' | 'diamond' | 'triangle'

const EVENT_TYPE_SHAPES: Record<string, PinShape> = {
  SOCIAL: 'circle',
  TANGO_MILONGA: 'ring',
  GROUP_CLASS: 'square',
  WORKSHOP: 'diamond',
  FESTIVAL: 'triangle',
}

function getEventTypeShape(eventType: string): PinShape {
  return EVENT_TYPE_SHAPES[eventType] || 'circle'
}
// The homepage map demo reuses the same shape/color/jitter logic so its pins
// read exactly like the events page's.
export { getEventTypeShape }

// Legend data: shape unicode + short label
const SHAPE_LEGEND: { shape: PinShape; label: string; unicode: string }[] = [
  { shape: 'circle', label: 'Social', unicode: '\u25CF' },
  { shape: 'ring', label: 'Milonga', unicode: '\u25C9' },
  { shape: 'square', label: 'Class', unicode: '\u25A0' },
  { shape: 'diamond', label: 'Workshop', unicode: '\u25C6' },
  { shape: 'triangle', label: 'Festival', unicode: '\u25B2' },
]

// --- SVG icon builder ---
export function makeSvg(color: string, shape: PinShape): string {
  const size = 26
  let shapeEl: string

  switch (shape) {
    case 'circle':
      shapeEl = `<circle cx="13" cy="13" r="10" fill="${color}" stroke="white" stroke-width="2"/>`
      break
    case 'ring':
      // Donut: filled circle with white center hole (milonga)
      shapeEl = `<circle cx="13" cy="13" r="10" fill="${color}" stroke="white" stroke-width="2"/><circle cx="13" cy="13" r="4" fill="white"/>`
      break
    case 'square':
      shapeEl = `<rect x="3" y="3" width="20" height="20" rx="3" fill="${color}" stroke="white" stroke-width="2"/>`
      break
    case 'diamond':
      shapeEl = `<polygon points="13,2 24,13 13,24 2,13" fill="${color}" stroke="white" stroke-width="2"/>`
      break
    case 'triangle':
      shapeEl = `<polygon points="13,3 24,23 2,23" fill="${color}" stroke="white" stroke-width="2"/>`
      break
    default:
      shapeEl = `<circle cx="13" cy="13" r="10" fill="${color}" stroke="white" stroke-width="2"/>`
      break
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shapeEl}</svg>`
}

const iconCache = new Map<string, L.Icon>()

function makeIcon(color: string, shape: PinShape): L.Icon {
  const key = `${color}-${shape}`
  if (iconCache.has(key)) return iconCache.get(key)!

  const svg = makeSvg(color, shape)
  const url = `data:image/svg+xml;base64,${btoa(svg)}`

  const icon = L.icon({
    iconUrl: url,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
  iconCache.set(key, icon)
  return icon
}

// --- Jitter for overlapping pins ---
export function applyJitter(
  events: MapEvent[]
): (MapEvent & { jLat: number; jLng: number })[] {
  const buckets = new Map<string, number>()

  return events.map((ev) => {
    const key = `${ev.lat.toFixed(5)},${ev.lng.toFixed(5)}`
    const idx = buckets.get(key) || 0
    buckets.set(key, idx + 1)

    if (idx === 0) {
      return { ...ev, jLat: ev.lat, jLng: ev.lng }
    }

    // Spiral offset
    const angle = (idx * 137.5 * Math.PI) / 180
    const radius = 0.00015 * Math.ceil(idx / 6)
    return {
      ...ev,
      jLat: ev.lat + radius * Math.cos(angle),
      jLng: ev.lng + radius * Math.sin(angle),
    }
  })
}

// --- Component ---
export interface MapEvent {
  id: string
  title: string
  eventType: string
  venueName: string
  address: string | null
  styles: string
  startDateTime: string | Date
  endDateTime: string | Date | null
  lat: number
  lng: number
  price: number | null
  isRecurring?: boolean
  recurrenceInterval?: number | null
}

interface EventsMapViewProps {
  events: MapEvent[]
  /** Where the map opens when there is nothing to fit to. */
  center?: [number, number]
  zoom?: number
}

// Charlotte, NC center
const DEFAULT_CENTER: [number, number] = [35.2271, -80.8431]
const DEFAULT_ZOOM = 11

/**
 * Fit the map to the events on it.
 *
 * With every market on the map at once the pins are thousands of miles
 * apart, so the map has to zoom out to hold them rather than sit on one
 * city's centre.
 */
function FitToEvents({ events }: { events: MapEvent[] }) {
  const map = useMap()

  useEffect(() => {
    if (events.length === 0) return
    const bounds = L.latLngBounds(events.map((e) => [e.lat, e.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 })
  }, [events, map])

  return null
}

export function EventsMapView({ events, center, zoom }: EventsMapViewProps) {
  const jitteredEvents = useMemo(() => applyJitter(events), [events])

  const initialCenter = center ?? DEFAULT_CENTER
  const initialZoom = zoom ?? DEFAULT_ZOOM

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <MapErrorBoundary>
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          style={{ height: '520px', width: '100%' }}
          scrollWheelZoom={true}
        >
        <FitToEvents events={events} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {jitteredEvents.map((event) => {
          const color = getStyleColor(event.styles)
          const shape = getEventTypeShape(event.eventType)
          const icon = makeIcon(color, shape)
          const eventTypeLabel = EVENT_TYPES.find((t) => t.value === event.eventType)?.label || event.eventType
          const startDate = typeof event.startDateTime === 'string'
            ? new Date(event.startDateTime)
            : event.startDateTime

          return (
            <Marker key={event.id} position={[event.jLat, event.jLng]} icon={icon}>
              <Popup>
                <div className="text-sm min-w-48">
                  <p className="font-bold text-base mb-1">{event.title}</p>
                  <p className="text-xs font-medium flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-gray-500">{parseJsonArray(event.styles).join(', ') || 'Other'}</span>
                    <span className="sr-only">,</span>
                    <span className="text-primary">{eventTypeLabel}</span>
                  </p>
                  <p className="text-gray-600">{event.venueName}</p>
                  {event.address && (
                    <p className="text-gray-500 text-xs">{event.address}</p>
                  )}
                  {event.isRecurring && (
                    <p className="text-primary text-xs font-medium mt-1">
                      {event.recurrenceInterval === 2 ? 'Biweekly' : 'Weekly'} recurring
                    </p>
                  )}
                  <p className="text-gray-700 mt-1">
                    {formatDate(startDate)} at {formatTime(startDate)}
                  </p>
                  {event.price != null && (
                    <p className="text-gray-600 mt-0.5">
                      {event.price === 0 ? 'Free' : `$${event.price}`}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <a
                      href={`/events/${event.id}`}
                      className="text-primary hover:underline text-xs"
                    >
                      Details
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-xs"
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}
        </MapContainer>
      </MapErrorBoundary>

      {/* Legend */}
      <div className="bg-surface border-t border-gray-200 px-4 py-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
        <span className="font-medium mr-1">Shapes:</span>
        {SHAPE_LEGEND.map(({ label, unicode }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="text-gray-800">{unicode}</span>
            {label}
          </span>
        ))}
        <span className="mx-1">|</span>
        <span className="font-medium mr-1">Colors:</span>
        {Object.entries(DANCE_STYLE_COLORS).filter(([k]) => k !== 'Other').map(([style, color]) => (
          <span key={style} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {style}
          </span>
        ))}
      </div>
    </div>
  )
}
