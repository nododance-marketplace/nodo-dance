import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Calendar, ChevronRight, MapPin, Repeat } from 'lucide-react'
import { parseJsonArray, formatCurrency, formatDate, formatTime, getEventTypeValue } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'
import { getStyleColor, DANCE_STYLE_COLORS } from '@/lib/styleColors'

interface EventCardTileProps {
  event: {
    id: string
    title: string
    eventType: string
    styles: string
    startDateTime: Date | string
    endDateTime: Date | string | null
    venueName: string
    address: string | null
    price: number | null
    imageUrl?: string | null
    isRecurring?: boolean
    recurrenceInterval?: number | null
    otherStyle?: string | null
  }
}

export function EventCardTile({ event }: EventCardTileProps) {
  const rawStyles = parseJsonArray(event.styles)
  const styles = event.otherStyle
    ? rawStyles.map((s) => s === 'Other' ? event.otherStyle! : s)
    : rawStyles
  const styleColor = getStyleColor(event.styles)
  const eventTypeValue = getEventTypeValue(event.eventType, event.styles)
  const eventType = EVENT_TYPES.find((t) => t.value === eventTypeValue)
  const startDate = typeof event.startDateTime === 'string' ? new Date(event.startDateTime) : event.startDateTime

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors group"
      style={{ borderLeft: `3px solid ${styleColor}` }}
    >
      {/* Date column */}
      <div className="flex-shrink-0 w-16 text-center">
        <div className="text-xs font-semibold text-gray-900">
          {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
        </div>
        <div className="text-[11px] text-gray-500">
          {formatTime(startDate)}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{event.title}</h3>
          {event.isRecurring && (
            <Repeat className="w-3 h-3 text-indigo-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {event.venueName && (
            <span className="truncate max-w-[140px]">{event.venueName}</span>
          )}
          {event.venueName && styles.length > 0 && (
            <span className="text-gray-300">·</span>
          )}
          <div className="flex items-center gap-1">
            {styles.slice(0, 2).map((style) => (
              <span
                key={style}
                className="inline-flex items-center gap-0.5 text-[10px]"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: DANCE_STYLE_COLORS[style] || DANCE_STYLE_COLORS.Other }}
                />
                {style}
              </span>
            ))}
            {styles.length > 2 && (
              <span className="text-[10px] text-gray-400">+{styles.length - 2}</span>
            )}
          </div>
        </div>
      </div>

      {/* Price + chevron */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-700">
          {formatCurrency(event.price)}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}
