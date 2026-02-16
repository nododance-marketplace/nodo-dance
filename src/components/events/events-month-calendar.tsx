'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react'
import { parseJsonArray, formatTime, getEventTypeValue } from '@/lib/utils'
import { EVENT_TYPES } from '@/lib/constants'
import {
  getCalendarDays,
  groupEventsByDate,
  formatMonthDisplay,
  getPreviousMonth,
  getNextMonth,
  getCurrentMonth,
  formatMonthString,
  STYLE_COLORS,
} from '@/lib/calendar-utils'

interface Event {
  id: string
  title: string
  eventType: string
  styles: string
  startDateTime: Date | string
  endDateTime: Date | string | null
  venueName: string
  address: string | null
  price: number | null
  isRecurring?: boolean
}

interface EventsMonthCalendarProps {
  events: Event[]
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_EVENTS_PER_DAY = 3

export function EventsMonthCalendar({
  events,
  year,
  month,
  onMonthChange,
}: EventsMonthCalendarProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const calendarDays = getCalendarDays(year, month)
  const eventsByDate = groupEventsByDate(events)

  const handlePreviousMonth = () => {
    const prev = getPreviousMonth(year, month)
    onMonthChange(prev.year, prev.month)
  }

  const handleNextMonth = () => {
    const next = getNextMonth(year, month)
    onMonthChange(next.year, next.month)
  }

  const handleToday = () => {
    const current = getCurrentMonth()
    onMonthChange(current.year, current.month)
  }

  const toggleDayExpanded = (dateKey: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(dateKey)) {
      newExpanded.delete(dateKey)
    } else {
      newExpanded.add(dateKey)
    }
    setExpandedDays(newExpanded)
  }

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold text-gray-900">
          {formatMonthDisplay(year, month)}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousMonth}
            className="px-3"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            className="px-3"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-semibold text-gray-700 uppercase"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const dayEvents = eventsByDate.get(day.dateKey) || []
            const isExpanded = expandedDays.has(day.dateKey)
            const visibleEvents = isExpanded
              ? dayEvents
              : dayEvents.slice(0, MAX_EVENTS_PER_DAY)
            const hasMoreEvents = dayEvents.length > MAX_EVENTS_PER_DAY

            return (
              <div
                key={day.dateKey}
                className={`min-h-24 sm:min-h-32 border-r border-b border-gray-200 p-1 sm:p-2 ${
                  !day.isCurrentMonth ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                {/* Date Number */}
                <div className="flex items-center justify-between mb-1">
                  <div
                    className={`text-sm font-medium ${
                      day.isToday
                        ? 'bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs'
                        : day.isCurrentMonth
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {day.date.getDate()}
                  </div>
                </div>

                {/* Events */}
                <div className="space-y-1">
                  {visibleEvents.map((event) => (
                    <EventChip key={event.id} event={event} />
                  ))}

                  {/* Show More/Less Button */}
                  {hasMoreEvents && (
                    <button
                      onClick={() => toggleDayExpanded(day.dateKey)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium w-full text-left"
                    >
                      {isExpanded
                        ? 'Show less'
                        : `+${dayEvents.length - MAX_EVENTS_PER_DAY} more`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EventChip({ event }: { event: Event }) {
  const styles = parseJsonArray(event.styles)
  const primaryStyle = styles[0] || 'Salsa'
  const styleColor = STYLE_COLORS[primaryStyle] || {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
  }
  const eventTypeValue = getEventTypeValue(event.eventType, event.styles)
  const eventType = EVENT_TYPES.find((t) => t.value === eventTypeValue)
  const startDate =
    typeof event.startDateTime === 'string'
      ? new Date(event.startDateTime)
      : event.startDateTime

  return (
    <Link href={`/events/${event.id}`}>
      <div
        className={`${styleColor.bg} rounded px-1.5 py-1 cursor-pointer hover:opacity-80 transition-opacity`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className={`text-xs font-medium ${styleColor.text} truncate`}>
              {formatTime(startDate)}
              {event.isRecurring && (
                <Repeat className="w-3 h-3 inline-block ml-1 opacity-70" />
              )}
            </div>
            <div className={`text-xs ${styleColor.text} truncate font-medium`}>
              {event.title}
            </div>
          </div>
        </div>
        {/* Style Pills - hidden on mobile */}
        <div className="hidden sm:flex flex-wrap gap-0.5 mt-1">
          {styles.slice(0, 2).map((style) => (
            <span
              key={style}
              className={`text-[10px] px-1 py-0.5 rounded ${styleColor.bg} ${styleColor.text} font-medium`}
            >
              {style}
            </span>
          ))}
          {styles.length > 2 && (
            <span className={`text-[10px] px-1 py-0.5 rounded ${styleColor.bg} ${styleColor.text}`}>
              +{styles.length - 2}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
