/**
 * Backfill city, state and zip on events and candidates that have an address
 * but no resolved location.
 *
 * The marketplace is scoped to one city, so an event with no city cannot be
 * shown. Legacy rows were seeded before the location columns existed and
 * carry only a free-text address.
 *
 * Two sources of truth, in order:
 *
 *   1. The address, resolved through Nominatim — the same lookup the
 *      submission path uses, so a backfilled row and a newly submitted row
 *      are resolved identically.
 *   2. The source registry. Every Atlas source is registered against a city,
 *      so a source in "Austin, TX" places its events in Austin even when the
 *      page gave no usable address.
 *
 * The source's city is also used as geocoding context, because a street name
 * on its own is ambiguous: "8125 St. Charles Avenue" exists in several
 * states, and "8863 Anderson Mill Road" resolves to Aiken, South Carolina
 * unless it is looked up as an Austin address.
 *
 * Nothing is guessed. If a lookup contradicts the source's state, the row is
 * left alone and reported.
 *
 * Usage:
 *   npx tsx atlas/scripts/backfill-event-locations.ts            # report only
 *   npx tsx atlas/scripts/backfill-event-locations.ts --apply    # write
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '../../node_modules/.prisma/client'
import { geocodeAddress, sanitizeAddress } from '../../src/lib/geocode'
import { stateAbbreviation } from '../../src/lib/us-states'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const CACHE_DIR = resolve(__dirname, '..', '..', '.cache', 'geocode')
// v2: the key now includes the source city used as geocoding context.
const CACHE_FILE = resolve(CACHE_DIR, 'backfill-locations-v2.json')

/** Nominatim asks for at most one request a second. */
const MIN_INTERVAL_MS = 1100
let lastCall = 0

interface CachedPlace {
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
}

type Cache = Record<string, CachedPlace>

function loadCache(): Cache {
  if (!existsSync(CACHE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveCache(cache: Cache): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8')
}

/**
 * The zip the organizer wrote in the address wins over the geocoder's.
 *
 * A five-digit group is only a zip when nothing street-like follows it.
 * "11025 Monroe Rd, Matthews, NC 28105" contains two five-digit groups and
 * the first one is the street number, not the zip.
 */
const STREET_SUFFIX =
  /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|trail|trl|loop|alley|plaza|circle|cir)\b/i

function zipFromAddress(address: string): string | null {
  for (const match of address.matchAll(/\b(\d{5})\b/g)) {
    const after = address.slice(match.index! + match[0].length)
    const beforeNextComma = after.split(',')[0]
    if (STREET_SUFFIX.test(beforeNextComma)) continue // a street number
    return match[1]
  }
  return null
}

/**
 * Trim a scraped address down to something a geocoder can place.
 *
 * Extracted addresses often carry trailing junk from the page
 * ("8863 Anderson Mill Road #116 (new location!)"). The stored address is
 * never rewritten — only the lookup string is cleaned.
 */
function cleanAddress(address: string): string {
  let cleaned = address.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()

  // If the address contains a state and a zip, everything after them is junk.
  const stateZip = cleaned.match(/,\s*[A-Za-z]{2}\s+\d{5}\b/)
  if (stateZip && stateZip.index !== undefined) {
    cleaned = cleaned.slice(0, stateZip.index + stateZip[0].length)
  }

  return cleaned.trim()
}

async function resolvePlace(
  address: string,
  context: { city: string | null; state: string | null },
  cache: Cache
): Promise<CachedPlace | null> {
  const lookup = cleanAddress(address)
  const withContext = context.city ? `${lookup}, ${context.city}, ${context.state ?? ''}`.trim() : lookup
  const key = sanitizeAddress(withContext).toLowerCase()
  if (cache[key]) return cache[key]

  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()

  const geo = await geocodeAddress(withContext)
  if (!geo) return null

  const place: CachedPlace = {
    city: geo.city,
    state: geo.state,
    zip: zipFromAddress(lookup) ?? geo.zip,
    lat: geo.lat,
    lng: geo.lng,
  }
  cache[key] = place
  saveCache(cache)
  return place
}

interface SourceContext {
  city: string | null
  state: string | null
}

async function main() {
  const cache = loadCache()

  const events = await prisma.event.findMany({
    where: { city: null },
    select: { id: true, address: true, lat: true, lng: true },
  })
  const candidates = await prisma.candidateEvent.findMany({
    where: { city: null },
    select: {
      id: true,
      address: true,
      lat: true,
      lng: true,
      source: { select: { domain: true, organizationName: true, city: { select: { name: true, state: true } } } },
    },
  })

  console.log(`events missing a city    : ${events.length}`)
  console.log(`candidates missing a city: ${candidates.length}\n`)

  // ── Resolve the distinct lookups ────────────────────────────────────────
  const lookups = new Map<string, { address: string; context: SourceContext }>()
  for (const row of events) {
    if (row.address) {
      lookups.set(`${row.address}||`, { address: row.address, context: { city: null, state: null } })
    }
  }
  for (const row of candidates) {
    const city = row.source.city
    const context: SourceContext = { city: city?.name ?? null, state: city?.state ?? null }
    const key = `${row.address ?? ''}||${context.city ?? ''},${context.state ?? ''}`
    lookups.set(key, { address: row.address ?? '', context })
  }

  console.log(`distinct lookups         : ${lookups.size}\n`)

  const places = new Map<string, CachedPlace | null>()
  const conflicts: string[] = []
  let i = 0
  for (const [key, { address, context }] of lookups) {
    i++
    const label = `${address || '(no address)'}`.slice(0, 44).padEnd(44)
    const ctx = context.city ? ` in ${context.city}, ${context.state}` : ''

    if (!address) {
      places.set(key, null)
      console.log(`  [${i}/${lookups.size}] ${label} no address`)
      continue
    }

    process.stdout.write(`  [${i}/${lookups.size}] ${label}${ctx}\n`)
    const place = await resolvePlace(address, context, cache)
    places.set(key, place)

    if (!place) {
      console.log('      could not resolve')
      continue
    }
    if (context.state && place.state && context.state !== place.state) {
      conflicts.push(`${address} — resolved to ${place.city}, ${place.state} but the source is in ${context.city}, ${context.state}`)
      console.log(`      CONFLICT: resolved ${place.city}, ${place.state}`)
      continue
    }
    console.log(`      -> ${place.city ?? '-'}, ${place.state ?? '-'} ${place.zip ?? '-'}`)
  }

  // ── Apply ───────────────────────────────────────────────────────────────
  let updatedEvents = 0
  let updatedCandidates = 0
  let fromSource = 0
  let skipped = 0

  for (const row of events) {
    const key = `${row.address ?? ''}||`
    const place = row.address ? (places.get(key) ?? null) : null
    if (!place?.city || !place.state) {
      skipped++
      continue
    }
    if (APPLY) {
      await prisma.event.update({
        where: { id: row.id },
        data: {
          city: place.city,
          state: place.state,
          zip: place.zip,
          lat: row.lat ?? place.lat,
          lng: row.lng ?? place.lng,
        },
      })
    }
    updatedEvents++
  }

  for (const row of candidates) {
    const city = row.source.city
    const context: SourceContext = { city: city?.name ?? null, state: city?.state ?? null }
    const key = `${row.address ?? ''}||${context.city ?? ''},${context.state ?? ''}`
    const place = row.address ? (places.get(key) ?? null) : null

    let resolved: CachedPlace | null = place
    if (!resolved && city?.name && city.state) {
      // No usable address: the source registry places the event.
      resolved = { city: city.name, state: city.state, zip: null, lat: row.lat, lng: row.lng }
      fromSource++
    }
    if (!resolved?.city || !resolved.state) {
      skipped++
      continue
    }
    if (APPLY) {
      await prisma.candidateEvent.update({
        where: { id: row.id },
        data: {
          city: resolved.city,
          state: resolved.state,
          zip: resolved.zip,
          lat: row.lat ?? resolved.lat,
          lng: row.lng ?? resolved.lng,
        },
      })
    }
    updatedCandidates++
  }

  console.log(
    `\n${APPLY ? 'updated' : 'would update'} ${updatedEvents} events and ${updatedCandidates} candidates` +
      ` (${fromSource} placed from the source registry, ${skipped} could not be placed)`
  )

  if (conflicts.length > 0) {
    console.log('\nConflicts — left alone:')
    for (const c of conflicts) console.log(`  ! ${c}`)
  }

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to save.')
    await prisma.$disconnect()
    return
  }

  console.log(`\nEvents still missing a city      : ${await prisma.event.count({ where: { city: null } })}`)
  console.log(`Candidates still missing a city: ${await prisma.candidateEvent.count({ where: { city: null } })}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
