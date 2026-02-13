import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns'

export interface CalendarDay {
  date: Date
  dateKey: string // YYYY-MM-DD
  isCurrentMonth: boolean
  isToday: boolean
}

/**
 * Generate calendar grid for a given month
 * Returns array of CalendarDay objects for all days in the calendar view
 */
export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = endOfMonth(firstDayOfMonth)

  const startDate = startOfWeek(firstDayOfMonth, { weekStartsOn: 0 }) // Sunday
  const endDate = endOfWeek(lastDayOfMonth, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: startDate, end: endDate })

  return days.map((date) => ({
    date,
    dateKey: format(date, 'yyyy-MM-dd'),
    isCurrentMonth: isSameMonth(date, firstDayOfMonth),
    isToday: isToday(date),
  }))
}

/**
 * Group events by date key (YYYY-MM-DD)
 */
export function groupEventsByDate<T extends { startDateTime: Date | string }>(
  events: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const event of events) {
    const date = typeof event.startDateTime === 'string'
      ? new Date(event.startDateTime)
      : event.startDateTime
    const dateKey = format(date, 'yyyy-MM-dd')

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, [])
    }
    grouped.get(dateKey)!.push(event)
  }

  return grouped
}

/**
 * Get the start and end dates for a month (for API queries)
 */
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const firstDay = new Date(year, month, 1)
  return {
    start: startOfMonth(firstDay),
    end: endOfMonth(firstDay),
  }
}

/**
 * Parse month string (YYYY-MM) to year and month
 */
export function parseMonthString(monthStr: string): { year: number; month: number } | null {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null

  const year = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1 // 0-indexed

  if (month < 0 || month > 11) return null

  return { year, month }
}

/**
 * Format year and month to YYYY-MM string
 */
export function formatMonthString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/**
 * Get previous month
 */
export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(year, month, 1)
  const prev = subMonths(date, 1)
  return {
    year: prev.getFullYear(),
    month: prev.getMonth(),
  }
}

/**
 * Get next month
 */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
  const date = new Date(year, month, 1)
  const next = addMonths(date, 1)
  return {
    year: next.getFullYear(),
    month: next.getMonth(),
  }
}

/**
 * Get current month
 */
export function getCurrentMonth(): { year: number; month: number } {
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
  }
}

/**
 * Format month for display (e.g., "February 2026")
 */
export function formatMonthDisplay(year: number, month: number): string {
  const date = new Date(year, month, 1)
  return format(date, 'MMMM yyyy')
}

/**
 * Style color mapping for dance styles
 */
export const STYLE_COLORS: Record<string, { bg: string; text: string }> = {
  Salsa: { bg: 'bg-red-100', text: 'text-red-700' },
  Bachata: { bg: 'bg-pink-100', text: 'text-pink-700' },
  Kizomba: { bg: 'bg-purple-100', text: 'text-purple-700' },
  Tango: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Zouk: { bg: 'bg-green-100', text: 'text-green-700' },
}
