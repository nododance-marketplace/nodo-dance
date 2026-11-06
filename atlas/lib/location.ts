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

/**
 * Is this string actually a street address?
 *
 * Free text near an event listing is full of things that look address-shaped
 * but are not: "December 7, 2026", "Flatirons Dance Academy", "Suite 200".
 * A real address starts with a house number and ends with a street suffix.
 */
export function looksLikeAddress(value: string | undefined | null): boolean {
  if (!value) return false
  const text = tidy(value)
  if (text.length < 6 || text.length > 120) return false
  // A date is not an address.
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text)) {
    return false
  }
  if (/^\d{1,2}[:.]\d{2}\s*(am|pm)?$/i.test(text)) return false
  if (!/\b\d{1,6}\s+/.test(text)) return false
  if (!new RegExp(`\\b(?:${STREET_SUFFIXES})\\b`, 'i').test(text)) return false
  return true
}

export interface FoundLocation {
  address?: string
  city?: string
  state?: string
  zip?: string
}

/**
 * Where an address stops and the rest of the page starts.
 *
 * A studio's address often runs straight on into the next thing on the
 * page: "1711 S. Broad Street (entrance on Castle Ave) Payments: click to
 * pay". The address ends at the first note or payment instruction, not at
 * the end of the sentence.
 */
const ADDRESS_END = /\s(?:\(|\b(?:payments?|cost|costs|price|pricing|register|registration|rsvp|tickets?|free|free entry|more info|contact)\b)/i

/** Find a street address in free text. */
export function findAddress(text: string): string | undefined {
  const m = ADDRESS_RE.exec(text)
  if (!m) return undefined
  let candidate = tidy(m[0])
  // Reject fragments that are really dates or prices.
  if (/^\d{1,2}[:.]\d{2}\s*(am|pm)?$/i.test(candidate)) return undefined
  if (!/\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Sq|Square)\b/i.test(candidate)) {
    return undefined
  }
  // Cut the address where the page moves on to something else.
  const end = candidate.search(ADDRESS_END)
  if (end > 0) candidate = candidate.slice(0, end)
  candidate = candidate.replace(/[\s,;:]+$/, '').trim()
  return candidate.length >= 6 ? candidate : undefined
}

/**
 * The city is what sits between the last comma and the state.
 *
 * "1711 S. Broad Street, Philadelphia, PA" is Philadelphia, not "Broad
 * Street Philadelphia". The street address has already been read
 * separately, so the city is the last segment before the state.
 */
const CITY_SEGMENT_RE = /,\s*([^,]{2,40}?)\s*,\s*([A-Z]{2})\b(?:\s*(\d{5}))?/g

const CITY_STATE_ZIP_RE = /\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/g

/**
 * A page often says more than the city before the state:
 * "134 Halton Road Greenville INSTRUCTION IN GREENVILLE, SC". The city is
 * the last word before the state, not the whole phrase in front of it.
 */
function trimToCity(phrase: string): string {
  const parts = phrase.split(/\s+/)
  for (let i = parts.length - 1; i > 0; i--) {
    if (/^(?:in|at|near|from|of)$/i.test(parts[i - 1])) {
      return parts.slice(i).join(' ')
    }
  }
  return phrase
}

/** Find "City, ST" and optional ZIP. */
export function findCityStateZip(text: string): FoundLocation {
  CITY_SEGMENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CITY_SEGMENT_RE.exec(text))) {
    const city = tidy(trimToCity(m[1]))
    const state = m[2]
    if (!city || city.length < 3) continue
    // A segment that is really the street address, not a city.
    if (/\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Blvd|Suite|Ste|Apt)\b\.?$/i.test(city)) continue
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(city)) continue
    return { city, state, zip: m[3] }
  }

  CITY_STATE_ZIP_RE.lastIndex = 0
  while ((m = CITY_STATE_ZIP_RE.exec(text))) {
    const city = tidy(trimToCity(m[1]))
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
