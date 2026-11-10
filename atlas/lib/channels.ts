/**
 * Channel sources — platform directories that list events across many cities.
 *
 * Unlike a studio's own calendar, a channel is a public aggregator whose HTML
 * already carries structured data (JSON-LD) or a predictable listing format,
 * so one registered source covers a whole style in a whole city.
 *
 * Every channel source carries its crawl interval (1 day) because aggregator
 * pages change fast, unlike a studio page which can be polled weekly.
 *
 * URL patterns verified against the live sites on 2026-11-09:
 *   Eventbrite  https://www.eventbrite.com/d/{state}--{city}/{style}/  (SSR JSON-LD, robots allows /d/)
 *   Meetup      https://www.meetup.com/find/us--{state}--{city}/{style}/  (SSR JSON-LD; the
 *               "?keywords=" query form is robots-disallowed, the path form is not)
 *   DanceUS     https://danceus.org/events/{style}/{city}-{state}-{style}-calendar/  (HTML listing)
 */

export interface ChannelCityInfo {
  slug: string // e.g. 'charlotte-nc'
  name: string // e.g. 'Charlotte'
  state: string // e.g. 'NC'
}

export interface ChannelSourceSeed {
  url: string
  organizationName: string
  sourceCategory: string
  sourceType: 'HTML' | 'JSONLD' | 'ICAL' | 'RSS'
  supportedStyles: string[]
  discoveredVia: string
  intervalDays: number
  notes: string
}

// ── DanceUS national calendar enumeration ──────────────────────────────────

/** Public DanceUS style pages that link per-city style calendars. */
export const DANCEUS_STYLE_PAGES = [
  'salsa',
  'argentine-tango',
  'swing',
  'bachata',
  'kizomba',
  'latin-dance',
] as const

const DANCEUS_STYLE_TO_APP: Record<string, { styles: string[]; note: string }> = {
  salsa: { styles: ['Salsa'], note: 'salsa' },
  'argentine-tango': { styles: ['Tango'], note: 'argentine tango' },
  swing: { styles: ['West Coast Swing'], note: 'swing (Lindy/East/West mix, QA refines per listing)' },
  bachata: { styles: ['Bachata'], note: 'bachata' },
  kizomba: { styles: ['Kizomba'], note: 'kizomba' },
  'latin-dance': { styles: [], note: 'general latin (cumbia/merengue/mambo plurality)' },
}

/**
 * Area tokens seen in DanceUS calendar slugs. Most are 2-letter state
 * abbreviations; metros sometimes use their own token (NYC, DC). Token →
 * { state, timeZone }. An unknown token means the calendar is skipped —
 * better to miss a city than to invent a timezone for it.
 */
const AREA_TOKENS: Record<string, { state: string; stateName: string; timeZone: string }> = {
  al: { state: 'AL', stateName: 'Alabama', timeZone: 'America/Chicago' },
  ak: { state: 'AK', stateName: 'Alaska', timeZone: 'America/Anchorage' },
  az: { state: 'AZ', stateName: 'Arizona', timeZone: 'America/Phoenix' },
  ar: { state: 'AR', stateName: 'Arkansas', timeZone: 'America/Chicago' },
  ca: { state: 'CA', stateName: 'California', timeZone: 'America/Los_Angeles' },
  co: { state: 'CO', stateName: 'Colorado', timeZone: 'America/Denver' },
  ct: { state: 'CT', stateName: 'Connecticut', timeZone: 'America/New_York' },
  dc: { state: 'DC', stateName: 'District of Columbia', timeZone: 'America/New_York' },
  de: { state: 'DE', stateName: 'Delaware', timeZone: 'America/New_York' },
  fl: { state: 'FL', stateName: 'Florida', timeZone: 'America/New_York' },
  ga: { state: 'GA', stateName: 'Georgia', timeZone: 'America/New_York' },
  hi: { state: 'HI', stateName: 'Hawaii', timeZone: 'Pacific/Honolulu' },
  id: { state: 'ID', stateName: 'Idaho', timeZone: 'America/Boise' },
  il: { state: 'IL', stateName: 'Illinois', timeZone: 'America/Chicago' },
  in: { state: 'IN', stateName: 'Indiana', timeZone: 'America/New_York' },
  ia: { state: 'IA', stateName: 'Iowa', timeZone: 'America/Chicago' },
  ks: { state: 'KS', stateName: 'Kansas', timeZone: 'America/Chicago' },
  ky: { state: 'KY', stateName: 'Kentucky', timeZone: 'America/New_York' },
  la: { state: 'LA', stateName: 'Louisiana', timeZone: 'America/Chicago' },
  me: { state: 'ME', stateName: 'Maine', timeZone: 'America/New_York' },
  md: { state: 'MD', stateName: 'Maryland', timeZone: 'America/New_York' },
  ma: { state: 'MA', stateName: 'Massachusetts', timeZone: 'America/New_York' },
  mi: { state: 'MI', stateName: 'Michigan', timeZone: 'America/New_York' },
  mn: { state: 'MN', stateName: 'Minnesota', timeZone: 'America/Chicago' },
  ms: { state: 'MS', stateName: 'Mississippi', timeZone: 'America/Chicago' },
  mo: { state: 'MO', stateName: 'Missouri', timeZone: 'America/Chicago' },
  mt: { state: 'MT', stateName: 'Montana', timeZone: 'America/Denver' },
  ne: { state: 'NE', stateName: 'Nebraska', timeZone: 'America/Chicago' },
  nv: { state: 'NV', stateName: 'Nevada', timeZone: 'America/Los_Angeles' },
  nh: { state: 'NH', stateName: 'New Hampshire', timeZone: 'America/New_York' },
  nj: { state: 'NJ', stateName: 'New Jersey', timeZone: 'America/New_York' },
  nm: { state: 'NM', stateName: 'New Mexico', timeZone: 'America/Denver' },
  ny: { state: 'NY', stateName: 'New York', timeZone: 'America/New_York' },
  nc: { state: 'NC', stateName: 'North Carolina', timeZone: 'America/New_York' },
  nd: { state: 'ND', stateName: 'North Dakota', timeZone: 'America/Chicago' },
  oh: { state: 'OH', stateName: 'Ohio', timeZone: 'America/New_York' },
  ok: { state: 'OK', stateName: 'Oklahoma', timeZone: 'America/Chicago' },
  or: { state: 'OR', stateName: 'Oregon', timeZone: 'America/Los_Angeles' },
  pa: { state: 'PA', stateName: 'Pennsylvania', timeZone: 'America/New_York' },
  ri: { state: 'RI', stateName: 'Rhode Island', timeZone: 'America/New_York' },
  sc: { state: 'SC', stateName: 'South Carolina', timeZone: 'America/New_York' },
  sd: { state: 'SD', stateName: 'South Dakota', timeZone: 'America/Chicago' },
  tn: { state: 'TN', stateName: 'Tennessee', timeZone: 'America/Chicago' },
  tx: { state: 'TX', stateName: 'Texas', timeZone: 'America/Chicago' },
  ut: { state: 'UT', stateName: 'Utah', timeZone: 'America/Denver' },
  vt: { state: 'VT', stateName: 'Vermont', timeZone: 'America/New_York' },
  va: { state: 'VA', stateName: 'Virginia', timeZone: 'America/New_York' },
  wa: { state: 'WA', stateName: 'Washington', timeZone: 'America/Los_Angeles' },
  wv: { state: 'WV', stateName: 'West Virginia', timeZone: 'America/New_York' },
  wi: { state: 'WI', stateName: 'Wisconsin', timeZone: 'America/Chicago' },
  wy: { state: 'WY', stateName: 'Wyoming', timeZone: 'America/Denver' },
  nyc: { state: 'NY', stateName: 'New York', timeZone: 'America/New_York' },
}

/**
 * World area registry for DanceUS city calendars outside the US.
 *
 * Their international slugs are irregular: 'london-uk' (country token),
 * 'berlin-germany' (full country name), 'toronto-on-canada' and
 * 'montreal-qc-canada' (province + country), 'puerto-rico' (area = whole
 * slug, no city part). Each entry fixes the country and at least a default
 * timezone; city-level overrides refine Australia, where slugs carry no
 * province.
 */
export interface WorldArea {
  country: string
  countryName: string
  timeZone: string
  /** Slug suffix — keeps city slugs globally unique ('london-uk'). */
  suffix: string
}

const WORLD_COUNTRY_TOKENS: Record<string, WorldArea> = {
  uk: { country: 'GB', countryName: 'United Kingdom', timeZone: 'Europe/London', suffix: 'uk' },
  germany: { country: 'DE', countryName: 'Germany', timeZone: 'Europe/Berlin', suffix: 'germany' },
  spain: { country: 'ES', countryName: 'Spain', timeZone: 'Europe/Madrid', suffix: 'spain' },
  ireland: { country: 'IE', countryName: 'Ireland', timeZone: 'Europe/Dublin', suffix: 'ireland' },
  france: { country: 'FR', countryName: 'France', timeZone: 'Europe/Paris', suffix: 'france' },
  colombia: { country: 'CO', countryName: 'Colombia', timeZone: 'America/Bogota', suffix: 'colombia' },
  australia: { country: 'AU', countryName: 'Australia', timeZone: 'Australia/Sydney', suffix: 'australia' },
  'puerto-rico': { country: 'PR', countryName: 'Puerto Rico', timeZone: 'America/Puerto_Rico', suffix: 'puerto-rico' },
  canada: { country: 'CA', countryName: 'Canada', timeZone: 'America/Toronto', suffix: 'canada' },
  mexico: { country: 'MX', countryName: 'Mexico', timeZone: 'America/Mexico_City', suffix: 'mexico' },
  japan: { country: 'JP', countryName: 'Japan', timeZone: 'Asia/Tokyo', suffix: 'japan' },
  brazil: { country: 'BR', countryName: 'Brazil', timeZone: 'America/Sao_Paulo', suffix: 'brazil' },
  argentina: { country: 'AR', countryName: 'Argentina', timeZone: 'America/Argentina/Buenos_Aires', suffix: 'argentina' },
  netherlands: { country: 'NL', countryName: 'Netherlands', timeZone: 'Europe/Amsterdam', suffix: 'netherlands' },
  italy: { country: 'IT', countryName: 'Italy', timeZone: 'Europe/Rome', suffix: 'italy' },
  portugal: { country: 'PT', countryName: 'Portugal', timeZone: 'Europe/Lisbon', suffix: 'portugal' },
  belgium: { country: 'BE', countryName: 'Belgium', timeZone: 'Europe/Brussels', suffix: 'belgium' },
  switzerland: { country: 'CH', countryName: 'Switzerland', timeZone: 'Europe/Zurich', suffix: 'switzerland' },
  austria: { country: 'AT', countryName: 'Austria', timeZone: 'Europe/Vienna', suffix: 'austria' },
  poland: { country: 'PL', countryName: 'Poland', timeZone: 'Europe/Warsaw', suffix: 'poland' },
  'south-korea': { country: 'KR', countryName: 'South Korea', timeZone: 'Asia/Seoul', suffix: 'south-korea' },
  singapore: { country: 'SG', countryName: 'Singapore', timeZone: 'Asia/Singapore', suffix: 'singapore' },
  'hong-kong': { country: 'HK', countryName: 'Hong Kong', timeZone: 'Asia/Hong_Kong', suffix: 'hong-kong' },
  'new-zealand': { country: 'NZ', countryName: 'New Zealand', timeZone: 'Pacific/Auckland', suffix: 'new-zealand' },
  'united-arab-emirates': { country: 'AE', countryName: 'United Arab Emirates', timeZone: 'Asia/Dubai', suffix: 'united-arab-emirates' },
  'south-africa': { country: 'ZA', countryName: 'South Africa', timeZone: 'Africa/Johannesburg', suffix: 'south-africa' },
  'costa-rica': { country: 'CR', countryName: 'Costa Rica', timeZone: 'America/Costa_Rica', suffix: 'costa-rica' },
  panama: { country: 'PA', countryName: 'Panama', timeZone: 'America/Panama', suffix: 'panama' },
  'dominican-republic': { country: 'DO', countryName: 'Dominican Republic', timeZone: 'America/Santo_Domingo', suffix: 'dominican-republic' },
}

/** Canadian province slugs seen in DanceUS calendar URLs → timezone. */
const CANADA_PROVINCE_TZ: Record<string, string> = {
  bc: 'America/Vancouver',
  ab: 'America/Edmonton',
  sk: 'America/Regina',
  mb: 'America/Winnipeg',
  on: 'America/Toronto',
  qc: 'America/Toronto',
  nb: 'America/Moncton',
  ns: 'America/Halifax',
  pe: 'America/Halifax',
  nl: 'America/St_Johns',
  yt: 'America/Whitehorse',
  nt: 'America/Yellowknife',
  nu: 'America/Iqaluit',
}

/** Australia slugs carry no province — the city decides the timezone. */
const AUSTRALIA_CITY_TZ: Record<string, string> = {
  sydney: 'Australia/Sydney',
  canberra: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane',
  'gold-coast': 'Australia/Brisbane',
  adelaide: 'Australia/Adelaide',
  perth: 'Australia/Perth',
}

export interface DanceUsCalendar {
  /** Absolute URL of the city style-calendar. */
  url: string
  /** Normalised city slug ('charlotte-nc', 'london-uk'), matching DiscoveryCity.slug. */
  citySlug: string
  city: {
    name: string
    state: string
    stateName: string
    timeZone: string
    country: string
    countryName: string
  }
  styleUrlSegment: string
  styleLabel: string
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Resolve a non-US DanceUS city part into a world-city record. The slug
 * grammar is irregular, so this handles each observed shape explicitly:
 *   'berlin-germany'      → city + country token
 *   'toronto-on-canada'   → city + province + 'canada' (province → timezone)
 *   'gold-coast-australia' → city + 'australia' (city → timezone, since AU
 *                           slugs carry no province)
 *   'puerto-rico'         → area token is the whole slug (no city part)
 * Returns null for anything unrecognised — better to miss a city than to
 * invent a timezone for it. The original city part becomes the slug tail so
 * city slugs stay globally unique.
 */
function resolveWorldCity(cityAreaPart: string): {
  citySlug: string
  name: string
  state: string
  stateName: string
  timeZone: string
  country: string
  countryName: string
} | null {
  const tokens = cityAreaPart.split('-')
  const lastToken = tokens[tokens.length - 1]
  const prior = tokens[tokens.length - 2]

  // Canada: province slug immediately before the country token.
  if (lastToken === 'canada') {
    const provinceTz = prior ? CANADA_PROVINCE_TZ[prior] : undefined
    if (provinceTz) {
      const cityTokens = tokens.slice(0, tokens.length - 2)
      if (cityTokens.length === 0) return null
      return {
        citySlug: `${cityTokens.join('-')}-${prior}-canada`,
        name: titleCase(cityTokens.join('-')),
        state: prior.toUpperCase(),
        stateName: prior.toUpperCase(),
        timeZone: provinceTz,
        country: 'CA',
        countryName: 'Canada',
      }
    }
    // 'toronto-canada' without a province slug still parses, on the default tz.
    const canada = WORLD_COUNTRY_TOKENS['canada']
    const cityTokens = tokens.slice(0, tokens.length - 1)
    if (cityTokens.length === 0) return null
    return {
      citySlug: `${cityTokens.join('-')}-canada`,
      name: titleCase(cityTokens.join('-')),
      state: 'CA',
      stateName: 'Canada',
      timeZone: canada.timeZone,
      country: 'CA',
      countryName: 'Canada',
    }
  }

  // City-less area slugs: the whole part IS the area ('puerto-rico').
  const fullPart = WORLD_COUNTRY_TOKENS[cityAreaPart.toLowerCase()]
  if (fullPart) {
    return {
      citySlug: cityAreaPart,
      name: titleCase(cityAreaPart),
      state: fullPart.country,
      stateName: fullPart.countryName,
      timeZone: fullPart.timeZone,
      country: fullPart.country,
      countryName: fullPart.countryName,
    }
  }

  // 'london-uk' / 'berlin-germany': country token is the final segment.
  const countryArea = WORLD_COUNTRY_TOKENS[lastToken.toLowerCase()]
  if (!countryArea) return null
  const cityTokens = tokens.slice(0, tokens.length - 1)
  if (cityTokens.length === 0) return null
  const citySlugPart = cityTokens.join('-')

  // Australia slugs carry no province → the city decides the timezone.
  const timeZone =
    countryArea.country === 'AU' ? AUSTRALIA_CITY_TZ[citySlugPart] ?? countryArea.timeZone : countryArea.timeZone

  return {
    citySlug: cityAreaPart,
    name: titleCase(citySlugPart),
    state: countryArea.country,
    stateName: countryArea.countryName,
    timeZone,
    country: countryArea.country,
    countryName: countryArea.countryName,
  }
}

/**
 * Parse a DanceUS city-calendar link of the form
 *   /events/{stylePath}/{city-slug}-{area}-{style}-calendar/
 * into its city, area token and style. US state tokens resolve first; the
 * remaining shapes fall through to the world registry. Returns null for
 * anything that is not a recognisable city calendar.
 */
export function parseDanceUsCalendarLink(url: string): DanceUsCalendar | null {
  let parsed: URL
  try {
    parsed = new URL(url, 'https://danceus.org')
  } catch {
    return null
  }
  const m = /\/events\/([a-z0-9-]+)\/([a-z0-9-]+)-calendar\/?/.exec(parsed.pathname)
  if (!m) return null
  const styleUrlSegment = m[1]

  // The tail holds the style suffix ("…-argentine-tango-calendar"): match the
  // longest style page name that ends the remaining tokens.
  const tangoAlt = 'argentine-tango'
  const remainder = m[2] // e.g. 'new-york-nyc-tango' or 'charlotte-nc-salsa'
  let stylePart: string
  let cityAreaPart: string
  if (remainder.endsWith(`-${tangoAlt}`)) {
    stylePart = tangoAlt
    cityAreaPart = remainder.slice(0, remainder.length - tangoAlt.length - 1)
  } else {
    const lastDash = remainder.lastIndexOf('-')
    if (lastDash === -1) return null
    stylePart = remainder.slice(lastDash + 1)
    cityAreaPart = remainder.slice(0, lastDash)
  }

  // The area token is the last segment of the city part ('charlotte-nc' → 'nc',
  // 'new-york-nyc' → 'nyc'). US states and metro tokens resolve first; the
  // rest fall through to the world registry ('london-uk', 'toronto-on-canada',
  // or a city-less slug like 'puerto-rico' whose only token IS the area).
  let areaToken: string
  let citySlugPart = ''
  const areaDash = cityAreaPart.lastIndexOf('-')
  if (areaDash === -1) {
    areaToken = cityAreaPart.toLowerCase()
  } else {
    areaToken = cityAreaPart.slice(areaDash + 1).toLowerCase()
    citySlugPart = cityAreaPart.slice(0, areaDash)
  }

  const usArea = AREA_TOKENS[areaToken]
  if (usArea) {
    if (!citySlugPart) return null
    const latent = DANCEUS_STYLE_TO_APP[styleUrlSegment]
    return {
      url: `https://danceus.org${parsed.pathname}`,
      citySlug: `${citySlugPart}-${usArea.state.toLowerCase()}`,
      city: {
        name: titleCase(citySlugPart),
        state: usArea.state,
        stateName: usArea.stateName,
        timeZone: usArea.timeZone,
        country: 'US',
        countryName: 'United States',
      },
      styleUrlSegment,
      styleLabel: latent?.note ?? styleUrlSegment,
    }
  }

  const world = resolveWorldCity(cityAreaPart)
  if (!world) return null
  const latent = DANCEUS_STYLE_TO_APP[styleUrlSegment]
  return {
    url: `https://danceus.org${parsed.pathname}`,
    citySlug: world.citySlug,
    city: {
      name: world.name,
      state: world.state,
      stateName: world.stateName,
      timeZone: world.timeZone,
      country: world.country,
      countryName: world.countryName,
    },
    styleUrlSegment,
    styleLabel: latent?.note ?? styleUrlSegment,
  }
}


/**
 * Styles worth a channel source, with per-platform slugs.
 * Most platforms use the lowercase hyphenated style name; DanceUS calls Tango
 * "argentine-tango" and folds partner-dance spinning into "swing".
 */
const CHANNEL_STYLES: Array<{
  style: string
  eventbrite: string
  meetup: string
  danceUs: string
}> = [
  { style: 'Salsa', eventbrite: 'salsa', meetup: 'salsa', danceUs: 'salsa' },
  { style: 'Bachata', eventbrite: 'bachata', meetup: 'bachata', danceUs: 'bachata' },
  { style: 'Kizomba', eventbrite: 'kizomba', meetup: 'kizomba', danceUs: 'kizomba' },
  { style: 'Zouk', eventbrite: 'zouk', meetup: 'zouk', danceUs: 'zouk' },
  { style: 'Tango', eventbrite: 'tango', meetup: 'argentine-tango', danceUs: 'argentine-tango' },
  { style: 'West Coast Swing', eventbrite: 'west-coast-swing', meetup: 'west-coast-swing', danceUs: 'swing' },
  { style: 'Ballroom', eventbrite: 'ballroom', meetup: 'ballroom', danceUs: 'ballroom' },
]

/** Split 'charlotte-nc' into its parts; state is the last segment. */
function splitCitySlug(slug: string): { city: string; state: string } {
  const idx = slug.lastIndexOf('-')
  if (idx === -1) throw new Error(`City slug "${slug}" does not end with a "-st" state segment`)
  return { city: slug.slice(0, idx), state: slug.slice(idx + 1) }
}

/**
 * Build every channel source seed for a city. Deduped later by the canonical
 * URL in the source registry, so re-running is always safe.
 */
export function buildChannelSeeds(city: ChannelCityInfo): ChannelSourceSeed[] {
  const { city: citySlug, state } = splitCitySlug(city.slug)
  const stateLower = state.toLowerCase()
  const seeds: ChannelSourceSeed[] = []

  for (const s of CHANNEL_STYLES) {
    seeds.push({
      url: `https://www.eventbrite.com/d/${stateLower}--${citySlug}/${s.eventbrite}/`,
      organizationName: `Eventbrite — ${s.style} · ${city.name}`,
      sourceCategory: 'AGGREGATOR',
      sourceType: 'JSONLD',
      supportedStyles: [s.style],
      discoveredVia: 'CHANNEL_EVENTBRITE',
      intervalDays: 1,
      notes: 'Public Eventbrite city/keyword directory page. SSE HTML carries JSON-LD Event records.',
    })
  }

  for (const s of CHANNEL_STYLES) {
    seeds.push({
      // Path-style find URL, not the "?keywords=" query form: robots.txt for
      // meetup.com disallows any URL with a keywords parameter, and robots.txt
      // is a hard gate. The path form serves the same server-rendered
      // JSON-LD, scoped to the metro.
      url: `https://www.meetup.com/find/us--${stateLower}--${citySlug}/${s.meetup}/`,
      organizationName: `Meetup — ${s.style} · ${city.name}`,
      sourceCategory: 'AGGREGATOR',
      sourceType: 'JSONLD',
      supportedStyles: [s.style],
      discoveredVia: 'CHANNEL_MEETUP',
      intervalDays: 1,
      notes: 'Public Meetup find page, style path form (server-rendered JSON-LD). No API, no login.',
    })
  }

  for (const s of CHANNEL_STYLES) {
    seeds.push({
      url: `https://danceus.org/events/${s.danceUs}/${citySlug}-${stateLower}-${s.danceUs}-calendar/`,
      organizationName: `DanceUS — ${s.style} · ${city.name}`,
      sourceCategory: 'DIRECTORY',
      sourceType: 'HTML',
      supportedStyles: [s.style],
      discoveredVia: 'CHANNEL_DANCEUS',
      intervalDays: 1,
      notes: 'Public DanceUS city style-calendar listing page.',
    })
  }

  return seeds
}
