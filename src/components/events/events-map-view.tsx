'use client'

import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { parseJsonArray, formatDate, formatTime } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'

// --- Pin colors by dance genre ---
const GENRE_COLORS: Record<string, string> = {
  Salsa: '#DC2626',
  Bachata: '#F97316',
  Kizomba: '#7C3AED',
  Tango: '#1E293B',
  Zouk: '#059669',
  Other: '#64748B',
}

function getGenreColor(styles: string): string {
  const arr = parseJsonArray(styles)
  const primary = arr[0] || 'Other'
  return GENRE_COLORS[primary] || GENRE_COLORS.Other
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

// Legend data: shape unicode + short label
const SHAPE_LEGEND: { shape: PinShape; label: string; unicode: string }[] = [
  { shape: 'circle', label: 'Social', unicode: '\u25CF' },
  { shape: 'ring', label: 'Milonga', unicode: '\u25C9' },
  { shape: 'square', label: 'Class', unicode: '\u25A0' },
  { shape: 'diamond', label: 'Workshop', unicode: '\u25C6' },
  { shape: 'triangle', label: 'Festival', unicode: '\u25B2' },
]

// --- SVG icon builder ---
function makeSvg(color: string, shape: PinShape): string {
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
function applyJitter(
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
}

// Charlotte, NC center
const DEFAULT_CENTER: [number, number] = [35.2271, -80.8431]
const DEFAULT_ZOOM = 11

export function EventsMapView({ events }: EventsMapViewProps) {
  const jitteredEvents = useMemo(() => applyJitter(events), [events])

  const center = useMemo<[number, number]>(() => {
    if (events.length === 0) return DEFAULT_CENTER

    const sumLat = events.reduce((s, e) => s + e.lat, 0)
    const sumLng = events.reduce((s, e) => s + e.lng, 0)
    return [sumLat / events.length, sumLng / events.length]
  }, [events])

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: '600px' }}>
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {jitteredEvents.map((event) => {
          const color = getGenreColor(event.styles)
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
                  <p className="text-indigo-600 text-xs font-medium">{eventTypeLabel}</p>
                  <p className="text-gray-600">{event.venueName}</p>
                  {event.address && (
                    <p className="text-gray-500 text-xs">{event.address}</p>
                  )}
                  {event.isRecurring && (
                    <p className="text-indigo-600 text-xs font-medium mt-1">
                      {event.recurrenceInterval === 2 ? 'Biweekly' : 'Weekly'} recurring
                    </p>
                  )}
                  <p className="text-gray-700 mt-1">
                    {formatDate(startDate)} &middot; {formatTime(startDate)}
                  </p>
                  {event.price != null && (
                    <p className="text-gray-600 mt-0.5">
                      {event.price === 0 ? 'Free' : `$${event.price}`}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <a
                      href={`/events/${event.id}`}
                      className="text-indigo-600 hover:underline text-xs"
                    >
                      Details
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline text-xs"
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

      {/* Legend */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
        <span className="font-medium mr-1">Shapes:</span>
        {SHAPE_LEGEND.map(({ label, unicode }) => (
          <span key={label} className="flex items-center gap-1">
            <span className="text-gray-800">{unicode}</span>
            {label}
          </span>
        ))}
        <span className="mx-1">|</span>
        <span className="font-medium mr-1">Colors:</span>
        {Object.entries(GENRE_COLORS).filter(([k]) => k !== 'Other').map(([genre, color]) => (
          <span key={genre} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {genre}
          </span>
        ))}
      </div>
    </div>
  )
}
