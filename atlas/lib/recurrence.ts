/**
 * Recurrence Intelligence (Atlas Agent D).
 *
 * Rules this module enforces:
 *  - A series is never assumed to continue indefinitely. Every detected rule
 *    carries an explicit horizon (`until` or `count`) and an expiry date.
 *  - All occurrences are computed in the venue's local wall time, then
 *    converted to UTC. A 7:00pm class stays at 7:00pm across DST boundaries.
 *  - Confidence is derived from how explicit the source text is, never guessed.
 */
import type { RecurrenceRuleSpec } from './types'

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sundays: 0, sun: 0,
  monday: 1, mondays: 1, mon: 1,
  tuesday: 2, tuesdays: 2, tue: 2, tues: 2,
  wednesday: 3, wednesdays: 3, wed: 3,
  thursday: 4, thursdays: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fridays: 5, fri: 5,
  saturday: 6, saturdays: 6, sat: 6,
}

const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1,
  second: 2, '2nd': 2,
  third: 3, '3rd': 3,
  fourth: 4, '4th': 4,
  fifth: 5, '5th': 5,
}

export interface RecurrenceDetection {
  isRecurring: boolean
  rule?: RecurrenceRuleSpec
  /** Human-readable summary for the review queue. */
  label?: string
  confidence: number
}

/**
 * Resolve a local wall-clock date+time in an IANA timezone to a UTC instant.
 *
 * Uses the standard two-pass offset resolution: guess with the offset at the
 * naive UTC instant, then re-resolve with the offset at the guessed instant.
 * This is DST-correct for every real-world zone including half-hour offsets.
 */
export function wallTimeToUtc(
  localDate: string, // YYYY-MM-DD
  localTime: string, // HH:MM
  timeZone: string
): Date | null {
  const d = /(\d{4})-(\d{2})-(\d{2})/.exec(localDate)
  const t = /^(\d{1,2}):(\d{2})/.exec(localTime)
  if (!d || !t) return null

  const year = Number(d[1])
  const month = Number(d[2])
  const day = Number(d[3])
  const hour = Number(t[1])
  const minute = Number(t[2])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0)

  const offsetAt = (utcMs: number): number => {
    // Format the instant in the target zone, then diff against the same wall
    // clock read as if it were UTC. The difference is the zone's offset.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(utcMs))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') === 24 ? 0 : get('hour'),
      get('minute'),
      get('second')
    )
    return asUtc - utcMs
  }

  let guess = naiveUtc - offsetAt(naiveUtc)
  guess = naiveUtc - offsetAt(guess)
  return new Date(guess)
}

/** Inverse of wallTimeToUtc — render a UTC instant as local wall time. */
export function utcToWallTime(utc: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utc)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` }
}

/** Add days to a YYYY-MM-DD string, staying in calendar space. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Day of week for YYYY-MM-DD (0 = Sunday). */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Detect a recurrence rule from source text.
 *
 * Supported (explicit) forms:
 *   "every Wednesday at 8pm"        → WEEKLY;BYDAY=WE
 *   "every other Sunday"            → WEEKLY;INTERVAL=2;BYDAY=SU
 *   "first Friday of each month"     → MONTHLY;BYDAY=1FR
 *   "every Thursday"                → WEEKLY;BYDAY=TH
 *   "twice a month"                 → MONTHLY;INTERVAL=2
 *   "Tuesdays and Thursdays"        → WEEKLY;BYDAY=TU,TH
 *
 * Everything else (including "regularly", "often", "monthly-ish") is treated
 * as NOT a rule — a single occurrence with a note for the reviewer.
 */
export function detectRecurrence(
  text: string | undefined | null,
  anchorDate: string | undefined,
  timeZone: string,
  horizonMonths = 6
): RecurrenceDetection {
  if (!text) return { isRecurring: false, confidence: 0 }
  const src = text.toLowerCase().replace(/\s+/g, ' ').trim()

  // Weekday mentions are scanned first: a listing headed "Tuesdays and
  // Thursdays" carries no schedule keyword but is unambiguously a schedule.
  const days: number[] = []
  const weekdayRe = /\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|tues|thurs|mon|tue|wed|thu|fri|sat|sun)\b/gi
  let weekdayMatch: RegExpExecArray | null
  while ((weekdayMatch = weekdayRe.exec(src))) {
    const wd = WEEKDAYS[weekdayMatch[1].toLowerCase()]
    if (wd !== undefined && !days.includes(wd)) days.push(wd)
  }

  // Only treat text as a schedule if it carries schedule language.
  const scheduleSignal =
    /\bevery\b|\beach\b|\bweekly\b|\bbi-?weekly\b|\bmonthly\b|\btwice\b|\bthird\b|\bfourth\b|\bfirst\b|\bsecond\b|\bnight\b|\boccurs?\b|\bstarting\b|\brecurring\b/.test(
      src
    )
  const weekdaySignal =
    days.length >= 2 ||
    (days.length === 1 && /\b(night|class|classes|social|practice|practica|lesson|every|each|weekly)\b/.test(src))

  if (!scheduleSignal && !weekdaySignal) {
    return { isRecurring: false, confidence: 0 }
  }

  let interval = 1
  let frequency: 'WEEKLY' | 'MONTHLY' = 'WEEKLY'
  let monthlyOrdinal: number | null = null

  // "every other X" / "biweekly"
  if (/\bevery other\b|\bbi-?weekly\b|\balternate\b/.test(src)) interval = 2

  // Month-based?
  if (/\b(each|every) month\b|\bmonthly\b|\bmonth(?:ly)?\b/.test(src) && /\bmonth/.test(src)) {
    frequency = 'MONTHLY'
  }

  // "first Friday of each month"
  const ordMatch = /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(
    src
  )
  if (ordMatch) {
    frequency = 'MONTHLY'
    monthlyOrdinal = ORDINALS[ordMatch[1]] ?? null
    const wd = WEEKDAYS[ordMatch[2]]
    if (wd !== undefined) days.push(wd)
  }

  // Weekday mentions
  if (days.length === 0 && /\btwice a month\b/.test(src)) {
    frequency = 'MONTHLY'
    interval = 2
  }
  // Anchor + horizon
  let until: string | undefined
  let count: number | undefined
  const untilMatch =
    /\b(?:through|until|till|to)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/.exec(
      src
    )
  const countMatch = /\bfor\s+(\d{1,3})\s+(?:weeks?|months?|sessions?|classes?)\b/.exec(src)
  const startMatch = /\b(?:starting|beginning)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/.exec(
    src
  )

  if (countMatch) count = Number(countMatch[1])
  if (untilMatch) {
    const parsed = parseFlexibleDate(untilMatch[1])
    if (parsed) until = parsed
  }

  // A schedule with no weekday but an explicit cadence still counts: fall back
  // to the anchor date's weekday ("Weekly for 8 weeks" starting on a Tuesday).
  if (days.length === 0 && anchorDate) {
    days.push(dayOfWeek(anchorDate))
  }

  if (days.length === 0 && frequency === 'WEEKLY') {
    return { isRecurring: false, confidence: 0, label: 'Schedule language found but no day pattern' }
  }

  if (!until && !count) {
    // Every series gets a bounded horizon — never open-ended.
    const horizonBase = anchorDate ?? new Date().toISOString().slice(0, 10)
    until = horizonEnd(horizonBase, horizonMonths)
  }

  // Exceptions: "except holidays", "no class on X"
  const exceptions: string[] = []
  const exceptionMatch = /\bexcept\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/.exec(src)
  if (exceptionMatch) {
    const parsed = parseFlexibleDate(exceptionMatch[1])
    if (parsed) exceptions.push(parsed)
  }
  const holidayException = /\bexcept (?:holidays?|thanksgiving|christmas)\b/.test(src)
  if (holidayException) exceptions.push('HOLIDAYS')

  const byDay = days
    .slice()
    .sort((a, b) => a - b)
    .map(n => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][n])

  let rrule = `FREQ=${frequency}`
  if (interval > 1) rrule += `;INTERVAL=${interval}`
  if (frequency === 'MONTHLY' && monthlyOrdinal) {
    rrule += `;BYDAY=${monthlyOrdinal}${byDay[0] ?? 'MO'}`
  } else if (byDay.length) {
    rrule += `;BYDAY=${byDay.join(',')}`
  }
  if (until) rrule += `;UNTIL=${until.replace(/-/g, '')}`
  if (count) rrule += `;COUNT=${count}`

  // Confidence: explicit day + explicit horizon scores highest.
  let confidence = 0.5
  if (days.length) confidence += 0.2
  if (until) confidence += 0.15
  if (count) confidence += 0.15
  if (anchorDate) confidence += 0.05
  if (monthlyOrdinal) confidence += 0.05
  if (/\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(src)) confidence += 0.05
  confidence = Math.min(0.98, confidence)

  return {
    isRecurring: true,
    rule: {
      rrule,
      interval,
      byDay: days,
      until,
      count,
      exceptions,
      timeZone,
      originalText: text?.trim(),
      confidence,
    },
    label: describeRule(frequency, interval, days, monthlyOrdinal, until, count),
    confidence,
  }
}

function describeRule(
  frequency: string,
  interval: number,
  days: number[],
  monthlyOrdinal: number | null,
  until?: string,
  count?: number
): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayText = days.map(d => names[d]).join(' and ')
  let base: string
  if (frequency === 'MONTHLY' && monthlyOrdinal) {
    base = `Monthly on the ${monthlyOrdinal}${['st', 'nd', 'rd', 'th'][monthlyOrdinal - 1] || 'th'} ${dayText}`
  } else if (frequency === 'MONTHLY') {
    base = `Every ${interval === 2 ? '2 months' : 'month'}`
  } else {
    base = interval === 2 ? `Every other ${dayText}` : `Every ${dayText}`
  }
  if (count) base += ` for ${count} occurrences`
  if (until) base += ` until ${until}`
  return base
}

/** Parse a human date like "March 5" or "March 5, 2027" into YYYY-MM-DD. */
export function parseFlexibleDate(text: string, referenceYear?: number): string | null {
  const cleaned = text.toLowerCase().replace(/\./g, '').trim()
  const m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/.exec(cleaned)
  if (!m) return null
  const month = MONTHS[m[1]]
  if (month === undefined) return null
  const day = Number(m[2])
  if (day < 1 || day > 31) return null
  const year = m[3] ? Number(m[3]) : referenceYear ?? new Date().getUTCFullYear()
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Default bounded horizon for a detected series. */
export function horizonEnd(anchorDate: string, months: number): string {
  const [y, m, d] = anchorDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, d))
  return dt.toISOString().slice(0, 10)
}

/**
 * Expand a rule into occurrence wall-clock dates between two bounds.
 * Deliberately bounded — never materializes an unbounded series.
 */
export function expandOccurrences(
  rule: RecurrenceRuleSpec,
  anchorDate: string,
  limit = 120
): Array<{ date: string; time: string }> {
  const out: Array<{ date: string; time: string }> = []
  const start = rule.byDay.length ? null : anchorDate
  let cursor = start ?? anchorDate
  const until = rule.until

  if (rule.byDay.length) {
    // Walk forward from the anchor to the first matching weekday.
    let day = anchorDate
    for (let i = 0; i < 7 && !rule.byDay.includes(dayOfWeek(day)); i++) {
      day = addDays(day, 1)
    }
    let weekIndex = 0
    let guard = 0
    while (out.length < limit && guard < limit * 10) {
      guard++
      if (rule.interval > 1 && weekIndex % rule.interval !== 0) {
        day = addDays(day, 7)
        weekIndex++
        continue
      }
      if (until && day > until) break
      if (!rule.exceptions.includes(day)) out.push({ date: day, time: '' })
      day = addDays(day, 7)
      weekIndex++
    }
    return out
  }

  // Monthly / interval-based
  const [y, m, d] = cursor.split('-').map(Number)
  let dt = new Date(Date.UTC(y, m - 1, d))
  let guard = 0
  while (out.length < limit && guard < limit * 3) {
    guard++
    const iso = dt.toISOString().slice(0, 10)
    if (until && iso > until) break
    if (!rule.exceptions.includes(iso)) out.push({ date: iso, time: '' })
    dt.setUTCMonth(dt.getUTCMonth() + Math.max(1, rule.interval))
  }
  return out
}
