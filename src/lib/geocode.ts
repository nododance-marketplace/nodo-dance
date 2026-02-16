/**
 * Server-side geocoding using OpenStreetMap Nominatim (free, no API key).
 * Only call on event submission, never on page render.
 */

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  if (!query.trim()) {
    console.log('[Geocode] Empty query, skipping')
    return null
  }

  console.log(`[Geocode] Querying: "${query}"`)

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
      console.error(`[Geocode] HTTP ${res.status} from Nominatim for query: "${query}"`)
      return null
    }

    const results: NominatimResult[] = await res.json()

    if (results.length === 0) {
      console.log(`[Geocode] No results for: "${query}"`)
      return null
    }

    const lat = parseFloat(results[0].lat)
    const lng = parseFloat(results[0].lon)

    if (isNaN(lat) || isNaN(lng)) {
      console.error(`[Geocode] Invalid coords from Nominatim: lat=${results[0].lat}, lon=${results[0].lon}`)
      return null
    }

    console.log(`[Geocode] Success: "${query}" → ${lat}, ${lng} (${results[0].display_name})`)
    return { lat, lng }
  } catch (error) {
    console.error('[Geocode] Error:', error)
    return null
  }
}

/**
 * Build a geocoding query string from event fields.
 * Combines venue name and address for better results.
 */
export function buildGeoQuery(
  venueName: string,
  address?: string | null,
  neighborhood?: string | null
): string {
  const parts: string[] = []

  if (address) parts.push(address)
  else if (venueName) parts.push(venueName)

  if (neighborhood) parts.push(neighborhood)

  // Default city context for better results
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte'
  parts.push(`${city}, NC`)

  return parts.join(', ')
}
