'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { EventCard } from '@/components/events/event-card'
import { EventsMonthCalendar } from '@/components/events/events-month-calendar'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, X, Plus, Calendar as CalendarIcon, List } from 'lucide-react'
import { DANCE_STYLES, EVENT_TYPES } from '@/lib/constants'
import {
  getCurrentMonth,
  parseMonthString,
  formatMonthString,
  getMonthRange,
} from '@/lib/calendar-utils'

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"><div className="bg-white rounded-xl h-96 animate-pulse" /></div>}>
      <EventsContent />
    </Suspense>
  )
}

function EventsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize state from URL params
  const urlView = searchParams.get('view') || 'calendar'
  const urlMonth = searchParams.get('month') || ''
  const urlSearch = searchParams.get('search') || ''
  const urlStyles = searchParams.get('styles')?.split(',').filter(Boolean) || []
  const urlEventTypes = searchParams.get('eventTypes')?.split(',').filter(Boolean) || []
  const urlDateFilter = searchParams.get('dateFilter') || 'upcoming'

  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list'>(urlView === 'list' ? 'list' : 'calendar')
  const [search, setSearch] = useState(urlSearch)
  const [selectedStyles, setSelectedStyles] = useState<string[]>(urlStyles)
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>(urlEventTypes)
  const [dateFilter, setDateFilter] = useState(urlDateFilter)
  const [showFilters, setShowFilters] = useState(false)

  // Month state for calendar view
  const currentMonth = getCurrentMonth()
  const parsedMonth = urlMonth ? parseMonthString(urlMonth) : null
  const [calendarYear, setCalendarYear] = useState(parsedMonth?.year || currentMonth.year)
  const [calendarMonth, setCalendarMonth] = useState(parsedMonth?.month || currentMonth.month)

  // Update URL params when state changes
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('view', view)
    if (view === 'calendar') {
      params.set('month', formatMonthString(calendarYear, calendarMonth))
    }
    if (search) params.set('search', search)
    if (selectedStyles.length > 0) params.set('styles', selectedStyles.join(','))
    if (selectedEventTypes.length > 0) params.set('eventTypes', selectedEventTypes.join(','))
    if (view === 'list') {
      params.set('dateFilter', dateFilter)
    }

    router.replace(`/events?${params.toString()}`, { scroll: false })
  }, [view, calendarYear, calendarMonth, search, selectedStyles, selectedEventTypes, dateFilter, router])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (selectedStyles.length > 0) params.set('styles', selectedStyles.join(','))
    if (selectedEventTypes.length > 0) params.set('eventTypes', selectedEventTypes.join(','))

    // For calendar view, fetch events for the entire month
    if (view === 'calendar') {
      const monthRange = getMonthRange(calendarYear, calendarMonth)
      params.set('monthStart', monthRange.start.toISOString())
      params.set('monthEnd', monthRange.end.toISOString())
    } else {
      params.set('dateFilter', dateFilter)
    }

    try {
      const response = await fetch(`/api/events?${params}`)
      const data = await response.json()
      const eventsArray = Array.isArray(data) ? data : []
      if (process.env.NODE_ENV !== 'production' && !Array.isArray(data)) {
        console.log('[Events] API returned non-array:', data)
      }
      setEvents(eventsArray)
    } catch (error) {
      console.error('Error fetching events:', error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [search, selectedStyles, selectedEventTypes, dateFilter, calendarYear, calendarMonth, view])

  // Fetch events when filters or view changes
  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  function handleMonthChange(year: number, month: number) {
    setCalendarYear(year)
    setCalendarMonth(month)
  }

  function toggleStyle(style: string) {
    setSelectedStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    )
  }

  function toggleEventType(type: string) {
    setSelectedEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  function clearFilters() {
    setSelectedStyles([])
    setSelectedEventTypes([])
    setSearch('')
    if (view === 'list') {
      setDateFilter('upcoming')
    }
  }

  const hasFilters =
    selectedStyles.length > 0 ||
    selectedEventTypes.length > 0 ||
    search !== '' ||
    (view === 'list' && dateFilter !== 'upcoming')

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">
            Dance Events
          </h1>
          <p className="text-lg text-gray-600">
            Discover socials, classes, and workshops near you
          </p>
        </div>
        <Link href="/submit-event">
          <Button variant="gradient">
            <Plus className="w-4 h-4 mr-2" />
            Submit Event
          </Button>
        </Link>
      </div>

      {/* View Toggle */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              view === 'calendar'
                ? 'bg-white shadow-sm text-primary font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            Calendar
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              view === 'list'
                ? 'bg-white shadow-sm text-primary font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <List className="w-4 h-4" />
            List
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex-1 w-full sm:max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search events, venues, or neighborhoods..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Filters and Date Toggle */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasFilters && (
            <Badge variant="primary" className="ml-1">
              {selectedStyles.length + selectedEventTypes.length + (search ? 1 : 0)}
            </Badge>
          )}
        </button>

        {/* Date Filter - Only for List View */}
        {view === 'list' && (
          <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
          </Select>
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {/* Filters Sidebar */}
        <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 sticky top-20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Filters</h3>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-accent-coral hover:underline flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>

            {/* Event Types */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Event Type</label>
              <div className="space-y-2">
                {EVENT_TYPES.map((type) => (
                  <label key={type.value} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedEventTypes.includes(type.value)}
                      onChange={() => toggleEventType(type.value)}
                      className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Dance Styles */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Dance Styles</label>
              <div className="space-y-2">
                {DANCE_STYLES.map((style) => (
                  <label key={style} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedStyles.includes(style)}
                      onChange={() => toggleStyle(style)}
                      className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm">{style}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="md:col-span-3">
          {loading ? (
            view === 'calendar' ? (
              <div className="bg-white rounded-xl h-96 animate-pulse" />
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white rounded-xl h-80 animate-pulse" />
                ))}
              </div>
            )
          ) : view === 'calendar' ? (
            <>
              {/* Empty state notice for calendar - shown above grid */}
              {events.length === 0 && (
                <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-indigo-900 mb-3">
                    {hasFilters
                      ? 'No events match your filters for this month.'
                      : 'No events posted yet for this month — be the first to submit one.'}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    {hasFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear Filters
                      </Button>
                    )}
                    <Link href="/submit-event">
                      <Button variant="gradient" size="sm">
                        Submit Event
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
              {/* Always render calendar grid */}
              <EventsMonthCalendar
                events={events}
                year={calendarYear}
                month={calendarMonth}
                onMonthChange={handleMonthChange}
              />
            </>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-600 mb-4">
                {hasFilters ? 'No events match your filters' : 'No events found'}
              </p>
              <p className="text-gray-500 mb-6">
                {hasFilters
                  ? 'Try adjusting your filters to see more events'
                  : 'Check back later for upcoming events'}
              </p>
              <div className="flex items-center justify-center gap-4">
                {hasFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
                <Link href="/submit-event">
                  <Button variant="gradient">Submit an Event</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                {events.length} event{events.length !== 1 ? 's' : ''} found
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
