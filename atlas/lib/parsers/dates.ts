/**
 * Date and time parsing for free-text event listings.
 *
 * Handles the shapes dance venues actually publish:
 *   "March 5, 2027" · "Mar 5" · "5th of March" · "2027-03-05" · "03/05/2027"
 *   "7:00 PM" · "7pm" · "7:00 - 9:00 PM" · "7-9pm" · "19:00"
 *
 * When a year is absent we anchor to the reference year, and roll to the next
 * year if the resulting date is more than ~60 days in the past — a listing for
 * "March 5" found in December is next March, not 11 months ago.
 */
import { parseFlexibleDate } from '../recurrence'

const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

export interface ParsedDateTime {
  date?: string // YYYY-MM-DD
  time?: string // HH:MM 24-hour local wall time
  endTime?: string
  /** The original fragment, kept for evidence. */
  raw?: string
}

const MONTH_NAMES =
  'january|february|march|april|may|june|july|august|september|october|november|december'
const MONTH_ABBR = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec'

const DATE_PATTERNS: RegExp[] = [
  // 2027-03-05
  /\b(\d{4})-(\d{2})-(\d{2})\b/,
  // March 5, 2027 / Mar 5th 2027
  new RegExp(`\\b(${MONTH_NAMES}|${MONTH_ABBR})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
  // 5 March 2027 / 5th of March
  new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES}|${MONTH_ABBR})\\.?(?:,?\\s*(\\d{4}))?\\b`, 'i'),
  // 03/05/2027 (US month/day/year)
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
]

export function parseDateTime(
  text: string,
  referenceDate: Date = new Date()
): ParsedDateTime {
  if (!text) return {}
  const result: ParsedDateTime = {}
  let dateEnd = 0

  for (const pattern of DATE_PATTERNS) {
    const m = pattern.exec(text)
    if (!m) continue

    let year: number | undefined
    let month: number
    let day: number

    if (pattern.source.includes('\\d{4})-')) {
      year = Number(m[1]); month = Number(m[2]); day = Number(m[3])
    } else if (pattern.source.includes('\\/')) {
      month = Number(m[1]); day = Number(m[2]); year = Number(m[3])
    } else if (/^\d{1,2}/.test(m[1])) {
      day = Number(m[1]); month = 0; year = m[3] ? Number(m[3]) : undefined
      const monthIndex = MONTH_INDEX[m[2].toLowerCase().replace(/\.$/, '')]
      if (monthIndex === undefined) continue
      if (day < 1 || day > 31) continue
      const y = year ?? referenceDate.getUTCFullYear()
      result.date = rollForward(
        `${y}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        referenceDate
      )
    } else {
      month = 0; day = Number(m[2]); year = m[3] ? Number(m[3]) : undefined
    }

    if (month === 0) {
      // Month-name form: build the date directly rather than round-tripping.
      const monthIndex = MONTH_INDEX[m[1].toLowerCase().replace(/\.$/, '')]
      if (monthIndex === undefined) continue
      const y = year ?? referenceDate.getUTCFullYear()
      if (day < 1 || day > 31) continue
      result.date = rollForward(
        `${y}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        referenceDate
      )
    } else {
      if (month < 1 || month > 12 || day < 1 || day > 31) continue
      const y = year ?? referenceDate.getUTCFullYear()
      result.date = rollForward(
        `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        referenceDate
      )
    }
    result.raw = m[0]
    dateEnd = (m.index ?? 0) + m[0].length
    break
  }

  // The time has to belong to this event. A page listing a dozen events
  // puts a dozen times in it, and a time found anywhere in the text is
  // usually a neighbour's. Only a time next to the date counts.
  const time = parseTime(text.slice(Math.max(0, dateEnd - 40), dateEnd + 40))
  if (time.time) result.time = time.time
  if (time.endTime) result.endTime = time.endTime

  return result
}

/** If a date without an explicit year lands far in the past, roll it forward a year. */
function rollForward(date: string, reference: Date): string {
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed)) return date
  const ref = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  const diffDays = (ref - parsed) / 86400000
  if (diffDays > 60) {
    const dt = new Date(parsed)
    dt.setUTCFullYear(dt.getUTCFullYear() + 1)
    return dt.toISOString().slice(0, 10)
  }
  return date
}

export function parseTime(text: string): { time?: string; endTime?: string; raw?: string } {
  if (!text) return {}

  // Range first: "7:00 - 9:00 PM", "7-9pm", "7pm until 9"
  const range =
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(
      text
    )
  if (range) {
    // The meridiem for the START may be attached to it ("7pm - 9pm") or
    // appear before the range ("doors at 7pm, 5 - 9").
    const startAmPm = /\b(am|pm)\b/i.exec(text.slice(0, range.index))
    const rangeStartMeridiem = range[3]?.toLowerCase()
    const endMeridiem = range[6]?.toLowerCase()

    let startMeridiem = rangeStartMeridiem ?? startAmPm?.[1]?.toLowerCase()
    // "6-9pm" means 6pm-9pm: when only the end carries a meridiem, apply it
    // to the start too (unless the start is later than the end).
    const effectiveEnd = endMeridiem ?? startMeridiem
    if (!startMeridiem && effectiveEnd) {
      const rawStart = Number(range[1]) % 12
      const rawEnd = Number(range[4]) % 12
      if (rawStart <= rawEnd) startMeridiem = effectiveEnd
    }
    // A range with no meridiem anywhere is ambiguous. "5 - 9" could be
    // morning or evening, and dance listings are usually evening. We do
    // not guess: an ambiguous time is no time, and the record is
    // quarantined for a human to read.
    if (!startMeridiem && !effectiveEnd) return {}
    const start = to24(Number(range[1]), Number(range[2] ?? 0), startMeridiem, range.index)
    const end = to24(Number(range[4]), Number(range[5] ?? 0), effectiveEnd, 0)
    if (start) return { time: start, endTime: end ?? undefined, raw: range[0] }
  }

  const single = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text)
  if (single) {
    const t = to24(Number(single[1]), Number(single[2] ?? 0), single[3].toLowerCase(), 0)
    if (t) return { time: t, raw: single[0] }
  }

  const twentyFour = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text)
  if (twentyFour) {
    const raw = twentyFour[1]
    const hour = Number(raw)
    const index = twentyFour.index ?? 0
    // "19:30" and "09:30" are a 24-hour clock: "09" is padded, "19" is
    // past noon. But "7:45" is a 12-hour clock, and without a meridiem it
    // could be morning or evening. A dance class at "7:45" is at 19:45;
    // reading it as 07:45 would publish an event twelve hours early.
    const isUnpaddedTwelveHour = hour <= 12 && !(raw.length === 2 && raw.startsWith('0'))
    if (isUnpaddedTwelveHour) {
      const near = text.slice(Math.max(0, index - 40), index + twentyFour[0].length + 40)
      const meridiem = /\b(am|pm)\b/i.exec(near)
      if (!meridiem) return {}
      const t = to24(hour, Number(twentyFour[2]), meridiem[1].toLowerCase(), 0)
      return { time: t ?? undefined, raw: twentyFour[0] }
    }
    return { time: `${raw.padStart(2, '0')}:${twentyFour[2]}`, raw: twentyFour[0] }
  }

  return {}
}

/**
 * Convert a 12-hour time to 24-hour. `hintOffset` lets a meridiem that
 * appears before the time (e.g. "PM party at 7") still apply.
 */
function to24(hour: number, minute: number, meridiem: string | undefined, hintOffset: number): string | null {
  if (hour < 0 || hour > 23) return null
  let h = hour
  if (meridiem === 'pm' && h < 12) h += 12
  else if (meridiem === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Pull a recurrence phrase out of free text.
 * Returns the matched fragment so the recurrence engine can reason on it.
 */
export function findRecurrencePhrase(text: string): string | undefined {
  if (!text) return undefined
  const patterns = [
    /\bevery (?:other |2nd |second )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b[^.\n]{0,60}/i,
    /\beach (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^.\n]{0,60}/i,
    /\b(?:the )?(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) of (?:each|every) month\b[^.\n]{0,40}/i,
    /\b(?:twice|once) (?:a|per) month\b[^.\n]{0,40}/i,
    /\bweekly\b[^.\n]{0,40}/i,
    /\bbi-?weekly\b[^.\n]{0,40}/i,
    /\bmonthly\b[^.\n]{0,40}/i,
    /\brecurring\b[^.\n]{0,40}/i,
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) nights?\b[^.\n]{0,40}/i,
  ]
  for (const p of patterns) {
    const m = p.exec(text)
    if (m) return m[0].trim()
  }
  return undefined
}
