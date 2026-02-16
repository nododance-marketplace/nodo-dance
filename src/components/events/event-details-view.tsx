'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, DollarSign, Clock, Instagram, Globe, Download } from 'lucide-react'
import { parseJsonArray, formatCurrency, formatDateTime, formatDate, formatTime, getEventTypeValue } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'
import { SaveButton } from '@/components/auth/save-button'

export function EventDetailsView({ event, isLoggedIn = false }: { event: any; isLoggedIn?: boolean }) {
  const styles = parseJsonArray(event.styles)
  const eventTypeValue = getEventTypeValue(event.eventType, event.styles)
  const eventType = EVENT_TYPES.find((t) => t.value === eventTypeValue)
  const startDate = new Date(event.startDateTime)
  const endDate = event.endDateTime ? new Date(event.endDateTime) : null

  const googleMapsUrl = event.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueName)}`

  function downloadCalendar() {
    const start = startDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const end = endDate
      ? endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
      : new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nodo Dance//Event//EN
BEGIN:VEVENT
UID:${event.id}@nododance.com
DTSTAMP:${start}
DTSTART:${start}
DTEND:${end}
SUMMARY:${event.title}
DESCRIPTION:${event.description?.replace(/\n/g, '\\n') || ''}
LOCATION:${event.venueName}${event.address ? ', ' + event.address : ''}
URL:${window.location.href}
END:VEVENT
END:VCALENDAR`

    const blob = new Blob([icsContent], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Image */}
      {event.imageUrl && (
        <div className="relative mb-8 rounded-2xl overflow-hidden shadow-lg">
          <div className="aspect-[21/9]">
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <Badge variant="primary" className="mb-2">{eventType?.label || event.eventType}</Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-white">{event.title}</h1>
          </div>
        </div>
      )}

      {/* Header */}
      <Card className="mb-8">
        <CardContent className="p-6">
          {!event.imageUrl && (
            <>
              <div className="flex items-start justify-between mb-4">
                <Badge variant="primary">{eventType?.label || event.eventType}</Badge>
                <div className="flex items-center gap-3">
                  <SaveButton itemId={event.id} type="event" />
                  <Badge variant={event.price === null ? 'success' : 'default'} className="text-lg px-3 py-1">
                    {formatCurrency(event.price)}
                  </Badge>
                </div>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold mb-4">{event.title}</h1>
            </>
          )}

          {event.imageUrl && (
            <div className="flex items-start justify-between mb-4">
              <div className="flex flex-wrap gap-2">
                {styles.map((style) => (
                  <Badge key={style}>{style}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <SaveButton itemId={event.id} type="event" />
                <Badge variant={event.price === null ? 'success' : 'default'} className="text-lg px-3 py-1">
                  {formatCurrency(event.price)}
                </Badge>
              </div>
            </div>
          )}

          {!event.imageUrl && (
            <div className="flex flex-wrap gap-2 mb-6">
              {styles.map((style) => (
                <Badge key={style}>{style}</Badge>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-accent-coral mt-1" />
              <div>
                <p className="font-semibold">Date</p>
                <p className="text-gray-700">{formatDate(startDate)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-accent-coral mt-1" />
              <div>
                <p className="font-semibold">Time</p>
                <p className="text-gray-700">
                  {formatTime(startDate)}
                  {endDate && ` - ${formatTime(endDate)}`}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-accent-coral mt-1" />
              <div>
                <p className="font-semibold">Venue</p>
                {event.venueName && <p className="text-gray-700">{event.venueName}</p>}
                {event.address && (
                  <p className="text-sm text-gray-600">{event.address}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-accent-coral mt-1" />
              <div>
                <p className="font-semibold">Price</p>
                <p className="text-gray-700">{formatCurrency(event.price)}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="gradient" onClick={downloadCalendar}>
              <Download className="w-4 h-4 mr-2" />
              Add to Calendar
            </Button>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <MapPin className="w-4 h-4 mr-2" />
                Open in Maps
              </Button>
            </a>
            {event.websiteUrl && (
              <a href={event.websiteUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <Globe className="w-4 h-4 mr-2" />
                  Website
                </Button>
              </a>
            )}
            {event.instagramUrl && (
              <a href={event.instagramUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <Instagram className="w-4 h-4 mr-2" />
                  Instagram
                </Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {event.description && (
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">About This Event</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{event.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Organizer */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-2xl font-bold mb-4">Organizer</h2>
          <p className="text-gray-700 mb-2">
            <strong>Name:</strong> {event.organizerName}
          </p>
          <p className="text-gray-700">
            <strong>Email:</strong>{' '}
            <a href={`mailto:${event.organizerEmail}`} className="text-primary hover:underline">
              {event.organizerEmail}
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
