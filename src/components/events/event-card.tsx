import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, DollarSign, Clock } from 'lucide-react'
import { parseJsonArray, formatCurrency, formatDate, formatTime, getEventTypeValue } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'

interface EventCardProps {
  event: {
    id: string
    title: string
    eventType: string
    styles: string
    startDateTime: Date | string
    endDateTime: Date | string | null
    venueName: string
    neighborhood: string | null
    price: number | null
    imageUrl?: string | null
  }
}

export function EventCard({ event }: EventCardProps) {
  const styles = parseJsonArray(event.styles)
  const eventTypeValue = getEventTypeValue(event.eventType, event.styles)
  const eventType = EVENT_TYPES.find((t) => t.value === eventTypeValue)
  const startDate = typeof event.startDateTime === 'string' ? new Date(event.startDateTime) : event.startDateTime

  return (
    <Card className="hover:shadow-lg transition-shadow overflow-hidden">
      {event.imageUrl && (
        <Link href={`/events/${event.id}`} className="block overflow-hidden">
          <div className="aspect-[16/9] overflow-hidden">
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
          </div>
        </Link>
      )}
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <Badge variant="primary">{eventType?.label || event.eventType}</Badge>
          <Badge variant={event.price === null ? 'success' : 'default'}>
            {formatCurrency(event.price)}
          </Badge>
        </div>

        <h3 className="text-xl font-semibold mb-3 line-clamp-2">{event.title}</h3>

        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
            {formatDate(startDate)}
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="w-4 h-4 mr-2 flex-shrink-0" />
            {formatTime(startDate)}
          </div>
          <div className="flex items-center text-sm text-gray-600">
            <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
            {event.venueName}
            {event.neighborhood && ` • ${event.neighborhood}`}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {styles.slice(0, 3).map((style) => (
            <Badge key={style} variant="default">
              {style}
            </Badge>
          ))}
          {styles.length > 3 && <Badge variant="default">+{styles.length - 3}</Badge>}
        </div>

        <Link href={`/events/${event.id}`}>
          <Button variant="outline" className="w-full">
            View Details
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
