import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, MapPin, Repeat } from 'lucide-react'
import { parseJsonArray, formatCurrency, formatDate, formatTime, getEventTypeValue } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'
import { getStyleColor, DANCE_STYLE_COLORS } from '@/lib/styleColors'

interface EventCardCompactProps {
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

export function EventCardCompact({ event }: EventCardCompactProps) {
  const rawStyles = parseJsonArray(event.styles)
  const styles = event.otherStyle
    ? rawStyles.map((s) => s === 'Other' ? event.otherStyle! : s)
    : rawStyles
  const styleColor = getStyleColor(event.styles)
  const eventTypeValue = getEventTypeValue(event.eventType, event.styles)
  const eventType = EVENT_TYPES.find((t) => t.value === eventTypeValue)
  const startDate = typeof event.startDateTime === 'string' ? new Date(event.startDateTime) : event.startDateTime

  return (
    <Link href={`/events/${event.id}`} className="block">
      <Card
        className="hover:shadow-md transition-shadow h-full"
        style={{ borderLeft: `3px solid ${styleColor}` }}
      >
        {event.imageUrl && (
          <div className="aspect-[2/1] overflow-hidden">
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Badge variant="primary" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                {eventType?.label || event.eventType}
              </Badge>
              {event.isRecurring && (
                <Repeat className="w-3 h-3 text-indigo-500 flex-shrink-0" />
              )}
            </div>
            <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
              {formatCurrency(event.price)}
            </span>
          </div>

          <h3 className="text-sm font-semibold line-clamp-1 mb-1.5">{event.title}</h3>

          <div className="space-y-0.5 text-xs text-gray-500 mb-2">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              <span>{formatDate(startDate)}</span>
              <span className="text-gray-300">·</span>
              <span>{formatTime(startDate)}</span>
            </div>
            {event.venueName && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{event.venueName}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {styles.slice(0, 2).map((style) => (
              <span
                key={style}
                className="inline-flex items-center gap-1 text-[10px] text-gray-600 bg-gray-50 rounded-full px-1.5 py-0.5"
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: DANCE_STYLE_COLORS[style] || DANCE_STYLE_COLORS.Other }}
                />
                {style}
              </span>
            ))}
            {styles.length > 2 && (
              <span className="text-[10px] text-gray-400">+{styles.length - 2}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
