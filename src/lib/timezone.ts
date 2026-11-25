/**
 * Parse date + time strings as a given IANA timezone and return the UTC Date.
 * On Vercel (UTC), `new Date("2026-02-27T19:00")` is 19:00 UTC — wrong.
 * This correctly interprets "19:00" as 7 PM in `timeZone` and stores the UTC
 * equivalent. Generalizes the proven parseAsET pattern from events/submit.
 */
export function parseAsLocal(dateStr: string, timeStr: string, timeZone: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00.000Z`)
  const localStr = naive.toLocaleString('en-US', { timeZone })
  const localDate = new Date(localStr)
  const offsetMs = naive.getTime() - localDate.getTime()
  return new Date(naive.getTime() + offsetMs)
}

/**
 * Add whole days to a YYYY-MM-DD calendar date as pure date math — never
 * milliseconds. Weekly series must land on the same wall-clock date every
 * week; ms arithmetic drifts by an hour across DST transitions.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** Guard against typos and arbitrary strings before anything hits the DB. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
