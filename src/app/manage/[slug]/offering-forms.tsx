'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DANCE_STYLES } from '@/lib/constants'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'] as const
const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

type Tab = 'CLASS' | 'EVENT'

interface Props {
  businessId: string
  timeZone: string
}

interface ApiError {
  error?: string
  details?: { message?: string; path?: (string | number)[] }[]
}

function StylePicker({
  selected,
  onToggle,
  invalid,
}: {
  selected: string[]
  onToggle: (style: string) => void
  invalid?: boolean
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-gray-800 mb-2">
        Dance styles <span className="text-gray-500 font-normal">(pick 1–6)</span>
      </legend>
      <div className="flex flex-wrap gap-2" aria-invalid={invalid || undefined}>
        {DANCE_STYLES.map((style) => {
          const active = selected.includes(style)
          return (
            <button
              key={style}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(style)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-primary text-primary-dark border-primary'
                  : 'bg-transparent text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            >
              {style}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * "Create class" and "Create event" forms for the business dashboard. Both post
 * to /api/business/offering; the server owns validation, slug generation and
 * the occurrence schedule — the client only collects what it is told to.
 */
export function OfferingForms({ businessId, timeZone }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('CLASS')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Shared fields
  const [title, setTitle] = useState('')
  const [styles, setStyles] = useState<string[]>([])
  const [level, setLevel] = useState<string>('Beginner')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('12')
  const [venueName, setVenueName] = useState('')
  const [city, setCity] = useState('')
  const [description, setDescription] = useState('')
  const [partnerRequired, setPartnerRequired] = useState(false)

  // Class fields
  const [startDate, setStartDate] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<string>('3')
  const [localStartTime, setLocalStartTime] = useState('')
  const [weeks, setWeeks] = useState('8')

  // Event fields
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')

  function toggleStyle(style: string) {
    setStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    )
  }

  /** Day-of-week (0=Sun..6=Sat) of a YYYY-MM-DD date, computed as UTC noon so
   * the weekday never shifts under a timezone. */
  function weekdayOf(dateStr: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
    if (!m) return null
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay()
  }

  function reset() {
    setTitle('')
    setStyles([])
    setPrice('')
    setDescription('')
    setPartnerRequired(false)
    setStartDate('')
    setLocalStartTime('')
    setEventStart('')
    setEventEnd('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const capacityNum = parseInt(capacity, 10)
    if (!Number.isInteger(capacityNum) || capacityNum < 1) {
      setError('Capacity must be a whole number of at least 1')
      return
    }
    if (styles.length === 0) {
      setError('Pick at least one dance style')
      return
    }

    let payload: Record<string, unknown>
    if (tab === 'CLASS') {
      const dow = parseInt(dayOfWeek, 10)
      const actualDay = weekdayOf(startDate)
      if (actualDay === null) {
        setError('Pick the first class date')
        return
      }
      if (actualDay !== dow) {
        setError(
          `The first date falls on a ${DAYS[actualDay].label} — pick that day, or choose a different date`
        )
        return
      }
      const weeksNum = parseInt(weeks, 10)
      if (!Number.isInteger(weeksNum) || weeksNum < 1 || weeksNum > 26) {
        setError('Weeks must be between 1 and 26')
        return
      }
      payload = {
        businessId,
        type: 'CLASS',
        title,
        styles,
        level: level === '' ? null : level,
        description: description || null,
        venueName,
        city: city || null,
        price: price === '' ? null : parseFloat(price),
        capacity: capacityNum,
        partnerRequired,
        timeZone,
        startDate,
        dayOfWeek: dow,
        localStartTime,
        isRecurring: weeksNum > 1,
        weeks: weeksNum,
      }
    } else {
      if (!eventStart || !eventEnd) {
        setError('Pick a start and end date and time for the event')
        return
      }
      payload = {
        businessId,
        type: 'EVENT',
        title,
        styles,
        level: null,
        description: description || null,
        venueName,
        city: city || null,
        price: price === '' ? null : parseFloat(price),
        capacity: capacityNum,
        partnerRequired,
        timeZone,
        startDateTime: eventStart,
        endDateTime: eventEnd,
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/business/offering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: ApiError & { success?: boolean; sessionCount?: number; slug?: string } =
        await res.json()
      if (!res.ok) {
        if (data.details && data.details.length > 0 && data.details[0].message) {
          setError(`Invalid ${data.details[0].path?.join('.') ?? 'input'}: ${data.details[0].message}`)
        } else {
          setError(typeof data.error === 'string' ? data.error : 'Something went wrong')
        }
        setSubmitting(false)
        return
      }
      setSuccess(
        tab === 'CLASS'
          ? `Class created with ${data.sessionCount ?? 1} session${(data.sessionCount ?? 1) === 1 ? '' : 's'}. It is live on its public page.`
          : 'Event created. It is live on its public page.'
      )
      reset()
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const inputLabel = 'block text-sm font-medium text-gray-800 mb-1.5'

  return (
    <section className="section-panel" aria-labelledby="create-offering-heading">
      <h2 id="create-offering-heading" className="text-2xl font-bold text-primary">
        Create an offering
      </h2>

      <div role="tablist" aria-label="Offering type" className="mt-5 inline-flex rounded-lg border border-gray-200 p-1">
        <button
          role="tab"
          aria-selected={tab === 'CLASS'}
          onClick={() => {
            setTab('CLASS')
            setError(null)
            setSuccess(null)
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'CLASS' ? 'bg-primary text-primary-dark' : 'text-gray-700 hover:text-primary'
          }`}
        >
          Create class
        </button>
        <button
          role="tab"
          aria-selected={tab === 'EVENT'}
          onClick={() => {
            setTab('EVENT')
            setError(null)
            setSuccess(null)
          }}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'EVENT' ? 'bg-primary text-primary-dark' : 'text-gray-700 hover:text-primary'
          }`}
        >
          Create event
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="offering-title" className={inputLabel}>
            Title
          </label>
          <Input
            id="offering-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder={tab === 'CLASS' ? 'Beginner Salsa' : 'Friday Bachata Social'}
          />
        </div>

        <StylePicker selected={styles} onToggle={toggleStyle} invalid={styles.length === 0} />

        {tab === 'CLASS' && (
          <div className="sm:max-w-xs">
            <label htmlFor="offering-level" className={inputLabel}>
              Level
            </label>
            <Select id="offering-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:max-w-xl">
          <div>
            <label htmlFor="offering-price" className={inputLabel}>
              Price per person ($)
            </label>
            <Input
              id="offering-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Empty = free"
            />
            {tab === 'EVENT' && (
              <p className="mt-1 text-xs text-gray-500">
                Free events can take RSVPs now — ticketed events arrive with paid
                bookings.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="offering-capacity" className={inputLabel}>
              Capacity
            </label>
            <Input
              id="offering-capacity"
              type="number"
              min="1"
              max="1000"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:max-w-xl">
          <div>
            <label htmlFor="offering-venue" className={inputLabel}>
              Venue
            </label>
            <Input
              id="offering-venue"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              required
              maxLength={120}
              placeholder="Studio 210"
            />
          </div>
          <div>
            <label htmlFor="offering-city" className={inputLabel}>
              City <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <Input
              id="offering-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={80}
              placeholder="Charlotte"
            />
          </div>
        </div>

        {tab === 'CLASS' ? (
          <fieldset className="space-y-4 sm:max-w-xl">
            <legend className="text-sm font-medium text-gray-800 mb-1">Weekly schedule</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="offering-first-date" className={inputLabel}>
                  First date
                </label>
                <Input
                  id="offering-first-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="offering-day" className={inputLabel}>
                  Day
                </label>
                <Select
                  id="offering-day"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                >
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="offering-time" className={inputLabel}>
                  Start time
                </label>
                <Input
                  id="offering-time"
                  type="time"
                  value={localStartTime}
                  onChange={(e) => setLocalStartTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="sm:max-w-[12rem]">
              <label htmlFor="offering-weeks" className={inputLabel}>
                Weeks in the series
              </label>
              <Input
                id="offering-weeks"
                type="number"
                min="1"
                max="26"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                1 = a single class; more = a recurring weekly series at the same
                local time, DST-safe.
              </p>
            </div>
          </fieldset>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:max-w-xl">
            <div>
              <label htmlFor="event-start" className={inputLabel}>
                Starts
              </label>
              <Input
                id="event-start"
                type="datetime-local"
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="event-end" className={inputLabel}>
                Ends
              </label>
              <Input
                id="event-end"
                type="datetime-local"
                value={eventEnd}
                onChange={(e) => setEventEnd(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="offering-description" className={inputLabel}>
            Description <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <Textarea
            id="offering-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="What dancers should expect, what to bring, parking tips…"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={partnerRequired}
            onChange={(e) => setPartnerRequired(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            A partner is required
            <span className="block text-xs text-gray-500">
              Dancers must bring their own partner to this offering.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-error)]">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-[var(--color-success)]">
            {success}
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : tab === 'CLASS' ? 'Create class' : 'Create event'}
        </Button>
      </form>
    </section>
  )
}
