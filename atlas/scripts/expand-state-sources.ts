/**
 * Expand the source registry across a whole state.
 *
 * The metro rollout found the studios inside one city at a time. A state
 * works better: OpenStreetMap knows every dance venue and every place with
 * a dance word in its name, so one query gives the whole picture - 397
 * places across 59 towns in North Carolina, of which 49 carry a website we
 * can read.
 *
 * The towns become cities in the registry, so each one gets a landing page
 * and an entry in the switcher. That is the invitation: a studio in
 * Wilmington can see that Nodo covers Wilmington and post its events.
 *
 * Usage:
 *   npx tsx atlas/scripts/expand-state-sources.ts NC
 *   npx tsx atlas/scripts/expand-state-sources.ts NC --apply
 */
import { createPrisma, type AtlasPrisma, type AtlasTarget } from '../lib/db'
import { Atlas } from '../lib/pipeline'
import { Fetcher } from '../lib/fetcher'

const prisma: AtlasPrisma = createPrisma(
  (process.argv.includes('--target=production') ? 'production' : 'local') as AtlasTarget
)
const APPLY = process.argv.includes('--apply')
const STATE = (process.argv.slice(2).find((a) => /^[A-Z]{2}$/.test(a)) ?? 'NC').toUpperCase()

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
]

/** The timezone a state runs on. Only the ones we serve are listed. */
const STATE_TIMEZONE: Record<string, string> = {
  NC: 'America/New_York',
  SC: 'America/New_York',
  GA: 'America/New_York',
  VA: 'America/New_York',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  FL: 'America/New_York',
  WA: 'America/Los_Angeles',
  OR: 'America/Los_Angeles',
  MA: 'America/New_York',
  PA: 'America/New_York',
  CO: 'America/Denver',
  IL: 'America/Chicago',
  NY: 'America/New_York',
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stateQuery(state: string): string {
  return `[out:json][timeout:240];
area["ISO3166-2"="US-${state}"][admin_level=4]->.a;
(
  nwr["leisure"="dance"](area.a);
  nwr["amenity"="dance_venue"](area.a);
  nwr["name"~"dance|dancing|salsa|bachata|tango|zouk|kizomba|milonga|swing|shag|cumbia|ballroom|bolero|flamenco|hip hop|belly",i](area.a);
);
out center tags;`
}

interface Place {
  name: string
  website: string | null
  town: string | null
  street: string | null
  postcode: string | null
}

async function census(fetcher: Fetcher, state: string): Promise<Place[]> {
  for (const mirror of MIRRORS) {
    try {
      const res = await fetcher.fetch(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(stateQuery(state))}`,
      })
      if (res.status !== 200) continue
      const json: any = JSON.parse(res.body)
      return (json.elements ?? [])
        .filter((e: any) => e.tags?.name)
        .map((e: any) => {
          const t = e.tags
          return {
            name: String(t.name),
            website: t.website ?? t['contact:website'] ?? t.url ?? t['contact:url'] ?? null,
            town: t['addr:city'] ?? t['addr:town'] ?? t['addr:village'] ?? t['is_in:city'] ?? null,
            street: t['addr:street'] ? `${t['addr:housenumber'] ?? ''} ${t['addr:street']}`.trim() : null,
            postcode: t['addr:postcode'] ?? null,
          }
        })
    } catch {
      continue
    }
  }
  return []
}

async function main() {
  const fetcher = new Fetcher({ politenessDelayMs: 1500, requestTimeoutMs: 250000 })
  const atlas = new Atlas({ prisma, fetcher })

  console.log(`censusing ${STATE}...`)
  const places = await census(fetcher, STATE)
  console.log(`  ${places.length} named places\n`)

  const withSite = places.filter((p) => p.website)
  const towns = new Map<string, number>()
  for (const p of places) {
    if (!p.town) continue
    towns.set(p.town, (towns.get(p.town) ?? 0) + 1)
  }

  console.log(`  ${withSite.length} carry a website`)
  console.log(`  ${towns.size} towns have a dance place with an address\n`)

  // Register the towns as cities so each one gets a landing page.
  const timeZone = STATE_TIMEZONE[STATE] ?? 'America/New_York'
  let citiesCreated = 0
  const priorities: Record<string, number> = { NC: 10, SC: 30, GA: 30, VA: 30, TN: 30, TX: 20, FL: 25, WA: 25, OR: 25, MA: 25, PA: 25, CO: 30, IL: 25, NY: 25 }
  const priority = priorities[STATE] ?? 50

  for (const town of towns.keys()) {
    const slug = `${slugify(town)}-${STATE.toLowerCase()}`
    const existing = await prisma.discoveryCity.findUnique({ where: { slug } })
    if (existing) continue
    if (APPLY) {
      await prisma.discoveryCity.create({
        data: {
          slug,
          name: town,
          state: STATE,
          stateName: undefined,
          country: 'US',
          timeZone,
          priority: priority,
          status: 'PENDING',
          notes: `Found in the ${STATE} census`,
        },
      })
    }
    citiesCreated++
  }
  console.log(`  ${citiesCreated} new cit${citiesCreated === 1 ? 'y' : 'ies'} registered`)

  // Register the places with a website as sources.
  let sourcesCreated = 0
  let noTown = 0
  for (const place of withSite) {
    if (!place.website) continue
    if (!place.town) {
      noTown++
      continue
    }
    const slug = `${slugify(place.town)}-${STATE.toLowerCase()}`
    const city = await prisma.discoveryCity.findUnique({ where: { slug } })

    let url = place.website
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`

    const { created } = await atlas.registerSource({
      url,
      organizationName: place.name,
      cityId: city?.id,
      sourceCategory: 'SCHOOL',
      sourceType: 'HTML',
      discoveredVia: 'OSM',
      notes: `Discovered in the ${STATE} census. Map data © OpenStreetMap contributors (ODbL).`,
    })
    if (created) sourcesCreated++
  }

  console.log(`  ${sourcesCreated} new sources registered`)
  console.log(`  ${noTown} had a website but no town, so they were left for a search`)

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to save.')
  } else {
    console.log('\nWritten.')
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
