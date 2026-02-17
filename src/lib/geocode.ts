/**
 * Server-side geocoding using OpenStreetMap Nominatim (free, no API key).
 * Only call on event submission, never on page render.
 */

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

/**
 * Strip suite/unit/building/floor/room tokens from an address.
 * Preserves the main street address, city, state, and zip.
 *
 * Examples:
 *   "123 Main St Ste 200, Charlotte, NC 28202"  → "123 Main St, Charlotte, NC 28202"
 *   "456 Oak Ave #12, Charlotte, NC 28202"       → "456 Oak Ave, Charlotte, NC 28202"
 *   "789 Elm Rd Unit B, Charlotte, NC 28202"     → "789 Elm Rd, Charlotte, NC 28202"
 *   "100 Pine St Building A, Charlotte, NC"      → "100 Pine St, Charlotte, NC"
 */
export function sanitizeAddress(address: string): string {
  // Pattern matches common unit tokens followed by an alphanumeric identifier.
  // The negative lookbehind (?<!\w) prevents matching inside words.
  // Tokens: Suite, Ste, Apt, Apartment, Unit, #, Bldg, Building, Floor, Fl, Room, Rm
  const unitPattern = /[,\s]+(?:suite|ste|apt|apartment|unit|#|bldg|building|floor|fl|room|rm)\.?\s*[a-z0-9-]*/gi
  let cleaned = address.replace(unitPattern, '')

  // Clean up any resulting double commas or trailing/leading whitespace
  cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim()
  // Remove trailing comma
  cleaned = cleaned.replace(/,\s*$/, '').trim()

  return cleaned
}

/**
 * Single Nominatim lookup. Returns coords or null.
 */
async function nominatimLookup(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('q', query)

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'NodoDance/1.0 (nodo-dance-app)',
      },
    })

    if (!res.ok) {
      console.error(`[Geocode] HTTP ${res.status} from Nominatim for: "${query}"`)
      return null
    }

    const results: NominatimResult[] = await res.json()

    if (results.length === 0) {
      return null
    }

    const lat = parseFloat(results[0].lat)
    const lng = parseFloat(results[0].lon)

    if (isNaN(lat) || isNaN(lng)) {
      console.error(`[Geocode] Invalid coords: lat=${results[0].lat}, lon=${results[0].lon}`)
      return null
    }

    return { lat, lng }
  } catch (error) {
    console.error('[Geocode] Fetch error:', error)
    return null
  }
}

/**
 * Geocode an address with automatic fallback.
 * 1. Try the full address as-is.
 * 2. If no results, retry with suite/unit tokens stripped.
 * 3. If both fail, return null (event saves without coords).
 */
export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) {
    console.log('[Geocode] Empty query, skipping')
    return null
  }

  console.log(`[Geocode] Attempt 1 (original): "${query}"`)
  const result = await nominatimLookup(query)

  if (result) {
    console.log(`[Geocode] Success (original): "${query}" → ${result.lat}, ${result.lng}`)
    return result
  }

  // Fallback: strip unit/suite tokens and retry
  const sanitized = sanitizeAddress(query)
  if (sanitized !== query && sanitized.trim()) {
    console.log(`[Geocode] Attempt 2 (sanitized): "${sanitized}"`)
    const fallbackResult = await nominatimLookup(sanitized)

    if (fallbackResult) {
      console.log(`[Geocode] Success (sanitized): "${sanitized}" → ${fallbackResult.lat}, ${fallbackResult.lng}`)
      return fallbackResult
    }

    console.warn(`[Geocode] Both attempts failed. Original: "${query}" | Sanitized: "${sanitized}"`)
  } else {
    console.warn(`[Geocode] No results for: "${query}" (no fallback available)`)
  }

  return null
}

/**
 * Build a geocoding query string from event fields.
 * If a full address is provided, use it as-is (it already contains city/state).
 * Only append city context when falling back to venue name alone.
 */
export function buildGeoQuery(
  venueName: string,
  address?: string | null,
): string {
  // Full address provided — use as-is (e.g. "123 Main St, Charlotte, NC 28202")
  if (address && address.trim()) {
    return address.trim()
  }

  // Fallback: venue name only — add city context for better results
  if (venueName && venueName.trim()) {
    const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte'
    return `${venueName.trim()}, ${city}, NC`
  }

  return ''
}
