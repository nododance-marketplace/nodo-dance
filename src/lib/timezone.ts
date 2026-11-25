/**
 * Parse date + time strings as a given IANA timezone and return the UTC Date.
 * On Vercel (UTC), `new Date("2026-02-27T19:00")` is 19:00 UTC — wrong.
 * This computes the zone's UTC offset at that wall time via Intl, so it is
 * correct no matter what timezone the host runs in, and stays DST-safe.
 * Generalizes the proven parseAsET pattern from events/submit.
 */
export function parseAsLocal(dateStr: string, timeStr: string, timeZone: string): Date {
  const utcGuess = Date.parse(`${dateStr}T${timeStr}:00.000Z`)
  if (Number.isNaN(utcGuess)) return new Date(NaN)
  // Offset of `timeZone` from UTC at the guess instant. Two-digit hours with
  // hour12:false can emit "24" at midnight — mod 24 keeps Date.UTC valid.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcGuess))
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  )
  return new Date(utcGuess - (wallAsUtc - utcGuess))
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
