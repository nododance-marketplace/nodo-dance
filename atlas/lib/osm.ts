/**
 * OpenStreetMap discovery channel for Atlas (Agent A).
 *
 * Why this channel exists:
 *   - It is free, requires no API key, and needs no search-engine scraping.
 *   - It is a licensed dataset (ODbL) with attribution obligations we honour.
 *   - It gives every metro a concrete starting inventory instead of a blank page.
 *
 * What it does NOT do:
 *   - It does not bypass robots.txt. An OSM-discovered website is still crawled
 *     through the normal gate.
 *   - It does not import addresses or personal details. Only the organisation
 *     name and its public website are taken, because those are what Atlas needs
 *     to register a source.
 *   - It does not treat "not in OSM" as "does not exist". OSM undercounts.
 *
 * Attribution: OpenStreetMap contributors, ODbL. Any surface that displays OSM
 * data must carry the attribution string.
 */
import { Fetcher } from './fetcher'

/**
 * Overpass mirrors, tried in order.
 *
 * A single public instance is a single point of failure: they rate-limit
 * aggressively (HTTP 429), time out under load, and some serve only a regional
 * extract (overpass.osm.ch is Switzerland-only). Each mirror below serves the
 * full planet — verify before trusting a new one.
 */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
]

const OSM_ATTRIBUTION = 'Map data © OpenStreetMap contributors (ODbL)'

const DANCE_NAME = '(dance|dancing|salsa|bachata|kizomba|zouk|milonga|tango|ballroom|shag|cumbia|country line)'

export interface OsmOrganisation {
  osmType: string
  osmId: number
  name: string
  website?: string
  city?: string
  state?: string
  postcode?: string
  lat?: number
  lng?: number
  tags: Record<string, string>
}

export interface OsmCity {
  city: string
  state: string
  /** Overpass area id, used for area-scoped queries. */
  areaId: number
}

/**
 * Overpass QL for dance organisations in a bounding box.
 *
 * The query requires a website tag because without a public web presence there
 * is nothing for Atlas to ingest. It does NOT filter on business tags — that
 * happens in code, where the decision can be tested.
 */
export function organisationQuery(bbox: string): string {
  return (
    `[out:json][timeout:120];` +
    `nwr(${bbox})["name"~"${DANCE_NAME}",i]` +
    `["website";"contact:website";"url";"contact:url"];` +
    `out center tags;`
  )
}

/** Overpass QL for every dance-named place, with no website requirement. */
export function censusQuery(bbox: string): string {
  return (
    `[out:json][timeout:120];` +
    `nwr(${bbox})["name"~"${DANCE_NAME}",i];` +
    `out center tags;`
  )
}

/** Overpass QL scoped to a named administrative area. */
export function areaQuery(city: string, state: string, country = 'USA'): string {
  return (
    `[out:json][timeout:180];` +
    `{{geocodeArea:${city}, ${state}, ${country}}}->.a;` +
    `nwr(area.a)["name"~"${DANCE_NAME}",i];` +
    `out center tags;`
  )
}

/**
 * Parse an Overpass response into organisation records.
 *
 * Deliberately keeps every named place, including those without a website —
 * parsing reports what OSM says; the policy decision of what to ingest with
 * belongs in the caller and is testable there.
 */
export function parseOrganisations(json: any): OsmOrganisation[] {
  const out: OsmOrganisation[] = []
  for (const element of json?.elements ?? []) {
    const tags = element.tags ?? {}
    const name = (tags.name ?? '').trim()
    if (!name) continue

    const website =
      tags.website ??
      tags['contact:website'] ??
      tags.url ??
      tags['contact:url']

    const lat = element.lat ?? element.center?.lat
    const lng = element.lon ?? element.center?.lon

    out.push({
      osmType: element.type,
      osmId: element.id,
      name,
      website: website ? normaliseWebsite(website) : undefined,
      city: tags['addr:city'] ?? undefined,
      state: tags['addr:state'] ?? undefined,
      postcode: tags['addr:postcode'] ?? undefined,
      lat: typeof lat === 'number' ? lat : undefined,
      lng: typeof lng === 'number' ? lng : undefined,
      tags,
    })
  }
  return out
}

/**
 * Clean a website value into a crawlable https URL.
 * OSM values are frequently bare domains ("example.com") or protocol-relative.
 */
export function normaliseWebsite(raw: string): string {
  let value = raw.trim()
  if (!value) return ''
  if (value.startsWith('//')) value = `https:${value}`
  if (!/^https?:\/\//i.test(value)) {
    // "www.example.com" and "example.com" both become https.
    value = `https://${value.replace(/^\/+/, '')}`
  }
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) return ''
    url.hash = ''
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid']
    for (const key of drop) url.searchParams.delete(key)
    return `${url.protocol}//${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

/**
 * Tags that mark a place as a business or organisation rather than a street
 * name, a neighbourhood or a natural feature.
 *
 * Without this filter a name regex for "dance" also matches "Shagbark Lane",
 * "Dancing Wind Road" and "Sundancer Court" — residential streets.
 */
const BUSINESS_TAGS = [
  'craft', 'shop', 'amenity', 'leisure', 'club', 'office', 'sport',
  'social_facility', 'community_centre', 'education', 'theatre', 'studio',
  'dance', 'golf', 'hotel',
]

/** Tags that mark a place as NOT an organisation. */
const NON_BUSINESS_TAGS = ['highway', 'place', 'barrier', 'natural', 'waterway', 'railway']

/**
 * Business types that are never dance organisations, even when the name
 * contains a dance word ("Salsarita's Fresh Mexican Grille").
 */
const EXCLUDED_AMENITIES = [
  'restaurant', 'bar', 'pub', 'cafe', 'fast_food', 'nightclub', 'ice_cream',
  'food_court', 'bbq', 'biergarten', 'tea',
]

/**
 * Does this OSM record look like a real dance organisation?
 *
 * Requires BOTH a dance signal in the name and a business/organisation tag.
 * Measured precision on the Charlotte sample: a name-only filter matched 21
 * places, of which 8 were dance organisations (38%) but only 1 carried a
 * website (5%). Requiring a business tag removes streets, restaurants and
 * residential names.
 */
export function looksLikeDanceOrg(org: OsmOrganisation): boolean {
  const tags = org.tags

  // A place explicitly tagged as a dance venue is a strong signal on its own.
  if (tags.leisure === 'dance' || tags.amenity === 'dance' || tags.sport === 'dancing') {
    return true
  }

  // Explicit dance organisations (the precise OSM tags).
  if (tags.amenity === 'dancing_school' || tags.education === 'dancing_school') {
    return true
  }

  // A dance-themed business tag, e.g. leisure=sports_centre with dance:teaching=yes.
  if (tags['dance:teaching'] === 'yes' || tags['dance:genre']) {
    return true
  }

  // Food and drink venues are never dance organisations.
  if (tags.amenity && EXCLUDED_AMENITIES.includes(tags.amenity)) return false

  const businessKey = BUSINESS_TAGS.find(key => tags[key] !== undefined)
  if (!businessKey) return false

  // Strip the business tag from the tag list before the exclusion check.
  const nonBusiness = NON_BUSINESS_TAGS.find(key => tags[key] !== undefined && key !== businessKey)
  if (nonBusiness) return false

  const name = org.name.toLowerCase()
  // Strong words: these indicate a dance business on their own.
  const strong = [
    'school of dance', 'dance academy', 'dance studio', 'dance studio',
    'dance school', 'dance company', 'dance center', 'dance centre',
    'dancing school', 'ballroom dance', 'salsa', 'bachata', 'kizomba',
    'zouk', 'milonga', 'tango', 'cumbia', 'carolina shag', 'swing dance',
    'dance social', 'dance org', 'dance collective',
  ]
  if (strong.some(s => name.includes(s))) return true

  // Otherwise require "dance" plus a dance-ish context word.
  if (!name.includes('dance') && !name.includes('dancing')) return false
  const context = ['studio', 'academy', 'school', 'center', 'centre', 'company', 'hall', 'club', 'arts', 'social', 'ballroom']
  return context.some(c => name.includes(c))
}

export class OsmDiscovery {
  constructor(private fetcher: Fetcher) {}

  /**
   * Discover dance organisations with public websites inside a bounding box.
   * Returns [] on failure — absence of results is never treated as proof that
   * a city has no dance community.
   */
  async discoverInBox(bbox: string): Promise<OsmOrganisation[]> {
    return this.run(organisationQuery(bbox))
  }

  /**
   * Discover by named area. Uses the Overpass geocodeArea shortcut, which is
   * more accurate than a hand-made bounding box but occasionally times out.
   */
  async discoverInArea(city: string, state: string, country = 'USA'): Promise<OsmOrganisation[]> {
    const area = `{{geocodeArea:${city}, ${state}, ${country}}}->.a;`
    const query =
      `[out:json][timeout:180];${area}` +
      `nwr(area.a)["name"~"${DANCE_NAME}",i]["website";"contact:website";"url";"contact:url"];` +
      `out center tags;`
    return this.run(query)
  }

  /**
   * POST an Overpass QL query, trying each mirror in turn.
   * Overpass accepts GET or POST with a `data` parameter.
   */
  private async run(query: string): Promise<OsmOrganisation[]> {
    for (const endpoint of ENDPOINTS) {
      try {
        const res = await this.fetcher.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          // Overpass answers slowly on a cold cache. The mirror list is the
          // retry mechanism, so a single attempt per mirror is enough.
          timeoutMs: 150000,
          maxRetries: 0,
        })
        if (res.status !== 200) continue
        const json = JSON.parse(res.body)
        return parseOrganisations(json)
      } catch {
        continue
      }
    }
    return []
  }

  /**
   * Every named dance place in an area, regardless of whether it is a real
   * organisation. Used to measure census coverage and filter precision.
   */
  async census(query: string): Promise<OsmOrganisation[]> {
    return this.run(query)
  }

  /**
   * Discover dance organisations that Atlas can actually ingest: a real
   * organisation with a public website.
   */
  async discoverSources(query: string): Promise<OsmOrganisation[]> {
    const all = await this.run(query)
    return all.filter(org => looksLikeDanceOrg(org) && Boolean(org.website))
  }
}

export { OSM_ATTRIBUTION }
