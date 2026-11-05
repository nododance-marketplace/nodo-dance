/**
 * Location heuristics for Atlas.
 *
 * Venue names and street addresses are often plain text on the page rather
 * than structured data. These patterns recover the common formats without
 * inventing anything: we only return text that literally appears on the page.
 */
import { tidy } from './parsers/html'

const STREET_SUFFIXES =
  'St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Sq|Square|Pkwy|Parkway|Hwy|Highway|Trail|Trl|Loop|Alley|Plaza|Circle|Cir|Court'

const ADDRESS_RE = new RegExp(
  `\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'’-]+\\s+){0,5}(?:${STREET_SUFFIXES})\\b[^,;.\\n|]{0,40}`,
  'i'
)

const CITY_STATE_ZIP_RE = /\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/g

export interface FoundLocation {
  address?: string
  city?: string
  state?: string
  zip?: string
}

/** Find a street address in free text. */
export function findAddress(text: string): string | undefined {
  const m = ADDRESS_RE.exec(text)
  if (!m) return undefined
  const candidate = tidy(m[0])
  // Reject fragments that are really dates or prices.
  if (/^\d{1,2}[:.]\d{2}\s*(am|pm)?$/i.test(candidate)) return undefined
  if (!/\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Sq|Square|Pkwy|Parkway)\b/i.test(candidate)) {
    return undefined
  }
  return candidate
}

/** Find "City, ST" and optional ZIP. */
export function findCityStateZip(text: string): FoundLocation {
  CITY_STATE_ZIP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CITY_STATE_ZIP_RE.exec(text))) {
    const city = tidy(m[1])
    const state = m[2]
    if (!city || city.length < 3) continue
    // Skip things like "Monday, Mar" and weekday fragments.
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(city)) continue
    return { city, state, zip: m[3] }
  }
  return {}
}

/**
 * Extract a venue name from a page. Venues are often introduced by "at X",
 * "venue:", "@ X" or a heading on its own line.
 */
export function findVenueName(text: string): string | undefined {
  const patterns = [
    /\bvenue\s*[:\-]\s*([^\n|]{3,60})/i,
    /\bat\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,4}(?:\s+(?:Studio|Center|Centre|Club|Hall|Room|Loft|Space|School|Dance\s+\w+))?)/,
    /\bheld\s+at\s+([^\n|]{3,60})/i,
  ]
  for (const pattern of patterns) {
    const m = pattern.exec(text)
    if (!m) continue
    const candidate = tidy(m[1])
    if (candidate.length < 3 || candidate.length > 70) continue
    if (/^(the|our|your|this|every|each|all|and|or)$/i.test(candidate)) continue
    return candidate
  }
  return undefined
}
