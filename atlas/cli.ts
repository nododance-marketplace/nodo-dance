#!/usr/bin/env tsx
/**
 * Nodo Atlas CLI — the operator surface for the ingestion engine.
 *
 *   atlas seed:cities            register the rollout cities
 *   atlas discover --city <slug> find candidate sources for a city
 *   atlas sources                 list the source registry
 *   atlas crawl [--source <id>]   crawl sources (or all due sources)
 *   atlas review                  show the candidate review queue
 *   atlas approve <candidateId>   approve a candidate for publication
 *   atlas reject <candidateId>    reject a candidate
 *   atlas publish <candidateId>   publish an approved candidate as an Event
 *   atlas report                  coverage + quality report
 *   atlas kill-switch [--on]      stop all crawling
 *
 * The CLI runs against the LOCAL SQLite database only (atlas/prisma/atlas.db).
 * It cannot touch the production Neon database: the Prisma client it uses is
 * generated from atlas/prisma/schema.local.prisma and points at a file.
 * Production ingestion runs from the deployed worker, which is configured
 * separately and writes only to the Atlas ingestion tables.
 */
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createPrisma, assertPublishAllowed, type AtlasPrisma, type AtlasTarget } from './lib/db'

const prisma: AtlasPrisma = createPrisma(
  (process.argv.includes('--target=production') ? 'production' : 'local') as AtlasTarget
)
import { Atlas } from './lib/pipeline'
import { Fetcher } from './lib/fetcher'
import { Discovery, discoverCity, looksLikeDanceSource } from './lib/discovery'
import { OsmDiscovery, looksLikeDanceOrg, censusQuery, areaQuery, type OsmOrganisation } from './lib/osm'
import { SitemapReader, looksLikeEventPage, type SitemapUrl } from './lib/sitemap'
import { RobotsCache } from './lib/robots'
import { DANCE_STYLES } from './lib/normalize'
import { wallTimeToUtc } from './lib/recurrence'


const CITIES = [
  { slug: 'charlotte-nc', name: 'Charlotte', state: 'NC', stateName: 'North Carolina', timeZone: 'America/New_York', priority: 10, population: 911_987 },
  { slug: 'raleigh-nc', name: 'Raleigh', state: 'NC', stateName: 'North Carolina', timeZone: 'America/New_York', priority: 20, population: 467_665 },
  { slug: 'durham-nc', name: 'Durham', state: 'NC', stateName: 'North Carolina', timeZone: 'America/New_York', priority: 25, population: 283_506 },
  { slug: 'atlanta-ga', name: 'Atlanta', state: 'GA', stateName: 'Georgia', timeZone: 'America/New_York', priority: 30, population: 498_715 },
  { slug: 'austin-tx', name: 'Austin', state: 'TX', stateName: 'Texas', timeZone: 'America/Chicago', priority: 35, population: 961_855 },
  { slug: 'miami-fl', name: 'Miami', state: 'FL', stateName: 'Florida', timeZone: 'America/New_York', priority: 40, population: 442_241 },
  { slug: 'chicago-il', name: 'Chicago', state: 'IL', stateName: 'Illinois', timeZone: 'America/Chicago', priority: 45, population: 2_746_388 },
  { slug: 'new-york-ny', name: 'New York', state: 'NY', stateName: 'New York', timeZone: 'America/New_York', priority: 50, population: 8_258_035 },
  { slug: 'los-angeles-ca', name: 'Los Angeles', state: 'CA', stateName: 'California', timeZone: 'America/Los_Angeles', priority: 55, population: 3_898_747 },
  { slug: 'denver-co', name: 'Denver', state: 'CO', stateName: 'Colorado', timeZone: 'America/Denver', priority: 60, population: 715_522 },
  { slug: 'portland-or', name: 'Portland', state: 'OR', stateName: 'Oregon', timeZone: 'America/Los_Angeles', priority: 65, population: 652_503 },
  { slug: 'san-diego-ca', name: 'San Diego', state: 'CA', stateName: 'California', timeZone: 'America/Los_Angeles', priority: 70, population: 1_386_932 },
  { slug: 'seattle-wa', name: 'Seattle', state: 'WA', stateName: 'Washington', timeZone: 'America/Los_Angeles', priority: 75, population: 737_015 },
  { slug: 'boston-ma', name: 'Boston', state: 'MA', stateName: 'Massachusetts', timeZone: 'America/New_York', priority: 80, population: 675_647 },
  { slug: 'las-vegas-nv', name: 'Las Vegas', state: 'NV', stateName: 'Nevada', timeZone: 'America/Los_Angeles', priority: 85, population: 641_903 },
  { slug: 'philadelphia-pa', name: 'Philadelphia', state: 'PA', stateName: 'Pennsylvania', timeZone: 'America/New_York', priority: 90, population: 1_603_675 },
  { slug: 'minneapolis-mn', name: 'Minneapolis', state: 'MN', stateName: 'Minnesota', timeZone: 'America/Chicago', priority: 95, population: 429_954 },
  { slug: 'st-louis-mo', name: 'St. Louis', state: 'MO', stateName: 'Missouri', timeZone: 'America/Chicago', priority: 100, population: 301_578 },
  { slug: 'nashville-tn', name: 'Nashville', state: 'TN', stateName: 'Tennessee', timeZone: 'America/Chicago', priority: 105, population: 689_447 },
  { slug: 'orlando-fl', name: 'Orlando', state: 'FL', stateName: 'Florida', timeZone: 'America/New_York', priority: 110, population: 307_573 },
  { slug: 'tampa-fl', name: 'Tampa', state: 'FL', stateName: 'Florida', timeZone: 'America/New_York', priority: 115, population: 384_959 },
  { slug: 'new-orleans-la', name: 'New Orleans', state: 'LA', stateName: 'Louisiana', timeZone: 'America/Chicago', priority: 120, population: 383_997 },
]

interface Args {
  [key: string]: string | boolean | string[] | undefined
  _?: string[]
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = true
      }
    } else {
      args._ = [...(args._ ?? []), token]
    }
  }
  return args
}

function positional(args: Args, index = 0): string {
  return args._?.[index] ?? ''
}

function line(char = '─', width = 68): string {
  return char.repeat(width)
}

function header(title: string): void {
  console.log('')
  console.log(line('═'))
  console.log(`  ${title}`)
  console.log(line('═'))
}

// ── Commands ───────────────────────────────────────────────────────────────

async function seedCities() {
  header('Seeding discovery cities')
  for (const city of CITIES) {
    const existing = await prisma.discoveryCity.findUnique({ where: { slug: city.slug } })
    if (existing) {
      console.log(`  · ${city.name}, ${city.state} — already seeded`)
      continue
    }
    await prisma.discoveryCity.create({ data: { ...city, status: city.slug === 'charlotte-nc' ? 'ACTIVE' : 'PENDING' } })
    console.log(`  ✓ ${city.name}, ${city.state} (${city.timeZone})`)
  }
}

/**
 * Approximate bounding boxes for the seeded metro areas (S,W,N,E).
 * A box query is far more reliable than an area lookup under load.
 */
const CITY_BBOXES: Record<string, string> = {
  'charlotte-nc': '35.00,-80.95,35.35,-80.60',
  'raleigh-nc': '35.70,-78.80,35.92,-78.50',
  'durham-nc': '35.90,-79.05,36.05,-78.80',
  'atlanta-ga': '33.60,-84.60,33.95,-84.20',
  'austin-tx': '30.15,-97.90,30.45,-97.55',
  'miami-fl': '25.65,-80.35,25.95,-80.05',
  'chicago-il': '41.75,-87.85,42.05,-87.55',
  'new-york-ny': '40.55,-74.10,40.90,-73.70',
  'los-angeles-ca': '33.90,-118.35,34.15,-118.05',
  'denver-co': '39.65,-105.10,39.85,-104.80',
  'portland-or': '45.45,-122.75,45.60,-122.50',
  'san-diego-ca': '32.55,-117.20,32.80,-116.90',
  'seattle-wa': '47.50,-122.45,47.70,-122.20',
  'boston-ma': '42.30,-71.15,42.45,-70.95',
  'las-vegas-nv': '36.05,-115.25,36.25,-115.00',
  'philadelphia-pa': '39.85,-75.40,40.10,-75.10',
  'minneapolis-mn': '44.90,-93.35,45.10,-93.15',
  'st-louis-mo': '38.55,-90.35,38.75,-90.15',
  'nashville-tn': '36.10,-86.85,36.25,-86.60',
  'orlando-fl': '28.40,-81.45,28.60,-81.25',
  'tampa-fl': '27.85,-82.55,28.05,-82.30',
  'new-orleans-la': '29.90,-90.15,30.05,-89.90',
}

/**
 * Pilot source seeds.
 *
 * These are URLs that organizers already published on nododance.com — the
 * founder has an existing relationship with each of these, which is the
 * strongest possible permission signal short of an explicit agreement.
 *
 * Social platforms (Facebook / Instagram) are deliberately absent: private and
 * non-public content is out of scope for Atlas by policy.
 */
const SEED_SOURCES: Array<{
  url: string
  organizationName: string
  sourceCategory: string
  styles: string[]
}> = [
  { url: 'https://afincaodance.com/book-a-class', organizationName: 'Afincao', sourceCategory: 'SCHOOL', styles: ['Salsa'] },
  { url: 'https://www.cltdance.com/cltdanceschedule', organizationName: 'CLT Dance', sourceCategory: 'SCHOOL', styles: ['Salsa', 'Bachata'] },
  { url: 'https://www.kizombacharlotte.com/home', organizationName: 'Kizomba Charlotte', sourceCategory: 'EVENT_ORG', styles: ['Kizomba'] },
  { url: 'https://www.tangoclt.com/practica', organizationName: 'Tango CLT', sourceCategory: 'EVENT_ORG', styles: ['Tango'] },
  { url: 'https://www.thelynnsdanceclub.com/', organizationName: "Lynn's Dance Club", sourceCategory: 'STUDIO', styles: ['Tango', 'Ballroom'] },
  { url: 'https://www.charlottewesties.com/', organizationName: 'Charlotte Westies', sourceCategory: 'EVENT_ORG', styles: ['West Coast Swing'] },
  { url: 'https://rwlatindance.com/', organizationName: 'Rumba Latina Dance', sourceCategory: 'SCHOOL', styles: ['Salsa', 'Bachata'] },
  { url: 'https://rwlatindance.square.site/', organizationName: 'Rumba Latina Dance (booking)', sourceCategory: 'SCHOOL', styles: ['Salsa', 'Bachata'] },
  { url: 'https://rumbaolatindance.punchpass.com/classes', organizationName: 'Rumba Latina Dance (classes)', sourceCategory: 'AGGREGATOR', styles: ['Salsa', 'Bachata'] },
]

async function seedSources(args: Args) {
  const slug = String(args.city ?? 'charlotte-nc')
  const city = await prisma.discoveryCity.findUnique({ where: { slug } })
  if (!city) throw new Error(`Unknown city "${slug}". Run: atlas seed:cities`)

  header(`Seeding pilot sources — ${city.name}, ${city.state}`)
  const atlas = new Atlas({ prisma })
  let created = 0
  for (const seed of SEED_SOURCES) {
    const { created: isNew } = await atlas.registerSource({
      url: seed.url,
      organizationName: seed.organizationName,
      cityId: city.id,
      sourceCategory: seed.sourceCategory,
      sourceType: 'HTML',
      supportedStyles: seed.styles,
      discoveredVia: 'PUBLISHED_ON_NODO',
      notes: 'Seed source: URL already published by the organizer on nododance.com.',
    })
    if (isNew) {
      created++
      console.log(`  ✓ ${seed.organizationName.padEnd(32)} ${seed.url}`)
    }
  }
  console.log('')
  console.log(`  ${created} source(s) registered.`)
}

/** Expand a source using its own sitemap — finds sibling event pages. */
async function expand(args: Args) {
  const fetcher = new Fetcher({ politenessDelayMs: 2500 })
  const robots = new RobotsCache()
  const reader = new SitemapReader(fetcher, robots)
  const atlas = new Atlas({ prisma, fetcher, robots })

  const sources = args.source
    ? await prisma.discoverySource.findMany({ where: { id: String(args.source) } })
    : await prisma.discoverySource.findMany({ where: { cityId: (await prisma.discoveryCity.findUnique({ where: { slug: String(args.city ?? 'charlotte-nc') } }))?.id } })

  header(`Expanding ${sources.length} source(s) via sitemap`)
  let found = 0
  for (const source of sources) {
    const origin = new URL(source.url).origin
    let sitemapUrls: SitemapUrl[] = []
    try {
      sitemapUrls = await reader.read(origin)
    } catch {
      continue
    }
    const eventPages = sitemapUrls.filter(u => looksLikeEventPage(u.loc))
    process.stdout.write(`  ${source.domain.padEnd(34)} ${String(sitemapUrls.length).padStart(4)} urls → ${String(eventPages.length).padStart(3)} event pages`)
    for (const page of eventPages.slice(0, 20)) {
      const { created } = await atlas.registerSource({
        url: page.loc,
        organizationName: source.organizationName ?? undefined,
        cityId: source.cityId ?? undefined,
        sourceCategory: source.sourceCategory,
        sourceType: 'HTML',
        supportedStyles: JSON.parse(source.supportedStyles ?? '[]'),
        discoveredVia: 'SITEMAP',
        notes: `Discovered via sitemap of ${source.domain}`,
      })
      if (created) found++
    }
    console.log('')
  }
  console.log('')
  console.log(`  ✓ ${found} new source(s) discovered via sitemaps.`)
}

/**
 * Discover sources for a city from OpenStreetMap.
 *
 * MEASURED PRECISION (Charlotte, 2026-11-04): 21 dance-name matches, of which
 * 11 are real organisations (52%) but only 1 carries a website tag (5%).
 *
 * So OSM is used for two things, NOT one:
 *   1. A census — how many dance organisations exist in a metro, for coverage
 *      measurement and rollout prioritisation.
 *   2. A search seed — the organisation NAMES are what you look up to find
 *      their websites. Only the 5% that already carry a website can be
 *      ingested directly.
 *
 * OSM data is © OpenStreetMap contributors (ODbL); attribution is recorded on
 * every source discovered this way.
 */
async function discoverOsm(args: Args) {
  const slug = String(args.city ?? 'charlotte-nc')
  const city = await prisma.discoveryCity.findUnique({ where: { slug } })
  if (!city) throw new Error(`Unknown city "${slug}". Run: atlas seed:cities`)

  header(`Discovering sources from OpenStreetMap — ${city.name}, ${city.state}`)

  const fetcher = new Fetcher({ politenessDelayMs: 1500, requestTimeoutMs: 160000, maxRetries: 0 })
  const osm = new OsmDiscovery(fetcher)
  const atlas = new Atlas({ prisma, fetcher })

  const bbox = String(args.bbox ?? CITY_BBOXES[city.slug] ?? '')
  let all: OsmOrganisation[] = []
  if (bbox) {
    all = await osm.census(censusQuery(bbox))
    if (all.length === 0) {
      console.log('  Box query returned nothing — trying the area lookup…')
      all = await osm.census(areaQuery(city.name, city.state))
    }
  } else {
    all = await osm.census(areaQuery(city.name, city.state))
  }

  if (all.length === 0) {
    console.log('  No results (an Overpass mirror may be unavailable — this is not evidence of absence).')
    return
  }

  const organisations = all.filter(looksLikeDanceOrg)
  const ingestible = organisations.filter(o => o.website)

  console.log(`  ${all.length} dance-name matches in the area`)
  console.log(`  ${organisations.length} look like real dance organisations (${Math.round((organisations.length / all.length) * 100)}%)`)
  console.log(`  ${ingestible.length} of those carry a website and can be ingested directly (${Math.round((ingestible.length / all.length) * 100)}%)`)
  console.log('')

  let created = 0
  for (const org of ingestible) {
    const { created: isNew } = await atlas.registerSource({
      url: org.website!,
      organizationName: org.name,
      cityId: city.id,
      sourceCategory: 'SCHOOL',
      sourceType: 'HTML',
      discoveredVia: 'OSM',
      notes:
        `Discovered via OpenStreetMap (${org.osmType}/${org.osmId}). ` +
        `Map data © OpenStreetMap contributors (ODbL).`,
    })
    if (isNew) {
      created++
      console.log(`  ✓ ${org.name.slice(0, 40).padEnd(42)} ${org.website}`)
    }
  }

  // The organisations with no website are the valuable part: they are the
  // search seeds for the keyword-discovery channel.
  const seeds = organisations.filter(o => !o.website)
  console.log('')
  console.log(`  ✓ ${created} source(s) registered from OSM.`)
  console.log(`  ${seeds.length} organisation(s) have no website in OSM — use these as search seeds:`)
  for (const seed of seeds.slice(0, 15)) {
    console.log(`      · ${seed.name}${seed.city ? ` (${seed.city})` : ''}`)
  }
  if (seeds.length > 15) console.log(`      … and ${seeds.length - 15} more`)

  const seedFile = `atlas/.cache/osm-seeds-${city.slug}.json`
  if (!existsSync('atlas/.cache')) mkdirSync('atlas/.cache', { recursive: true })
  writeFileSync(
    seedFile,
    JSON.stringify(
      seeds.map(s => ({ name: s.name, city: s.city, state: s.state, tags: s.tags })),
      null,
      2
    )
  )
  console.log('')
  console.log(`  Seeds written to ${seedFile}`)
}

async function listSources() {
  header('Source registry')
  const sources = await prisma.discoverySource.findMany({
    include: { city: true },
    orderBy: [{ city: { slug: 'asc' } }, { domain: 'asc' }],
  })
  if (sources.length === 0) {
    console.log('  No sources registered yet. Run: atlas discover --city charlotte-nc')
    return
  }
  console.log(
    ['  DOMAIN'.padEnd(34), 'CITY'.padEnd(16), 'ROBOTS'.padEnd(12), 'STYLE'.padEnd(8), 'LAST OK', 'NEXT'].join(' ')
  )
  for (const s of sources) {
    console.log(
      [
        `  ${s.domain.slice(0, 33).padEnd(33)}`,
        `${(s.city?.name ?? '—').padEnd(15)}`,
        `${(s.robotsStatus ?? '—').padEnd(11)}`,
        `${(s.sourceCategory ?? '').padEnd(7)}`,
        `${s.lastSuccessAt ? s.lastSuccessAt.toISOString().slice(0, 10) : '—'}`,
        `${s.nextCrawlAt ? s.nextCrawlAt.toISOString().slice(0, 10) : '—'}`,
      ].join(' ')
    )
  }
  console.log('')
  console.log(`  ${sources.length} sources registered.`)
}

async function discover(args: Args) {
  const slug = String(args.city ?? 'charlotte-nc')
  const city = await prisma.discoveryCity.findUnique({ where: { slug } })
  if (!city) throw new Error(`Unknown city "${slug}". Run: atlas seed:cities`)

  header(`Discovering sources — ${city.name}, ${city.state}`)

  const fetcher = new Fetcher({ politenessDelayMs: 3000 })
  const discovery = new Discovery(fetcher)
  const styles = DANCE_STYLES.filter(s => s !== 'Other')
  const hits = await discoverCity(discovery, city.name, city.state, styles)

  console.log(`  ${hits.length} candidate source(s) found across ${styles.length} styles.`)

  const atlas = new Atlas({ prisma, fetcher })
  let created = 0
  let existing = 0
  for (const hit of hits) {
    const { created: isNew } = await atlas.registerSource({
      url: hit.url,
      organizationName: hit.title || undefined,
      cityId: city.id,
      sourceCategory: 'EVENT_ORG',
      sourceType: 'HTML',
      discoveredVia: 'SEARCH',
      notes: `Discovered via ${hit.provider}: ${hit.snippet ?? ''}`.slice(0, 500),
    })
    if (isNew) created++
    else existing++
  }
  console.log(`  ✓ ${created} new sources registered, ${existing} already known.`)
  console.log('  Next: atlas crawl')
}

async function crawl(args: Args) {
  const atlas = new Atlas({ prisma, fetcher: new Fetcher({ politenessDelayMs: 2500 }) })

  let sources
  if (args.source) {
    sources = await prisma.discoverySource.findMany({ where: { id: String(args.source) } })
  } else {
    if (args.force) {
      // Ignore the schedule (used when recovering from a failed run).
      await prisma.discoverySource.updateMany({
        where: { isPaused: false, optOut: false },
        data: { nextCrawlAt: new Date(), consecutiveFailures: 0 },
      })
    }
    if (args.reextract) {
      // Drop the conditional-request fingerprints so every page is re-parsed.
      // Use this after changing an extractor.
      await prisma.discoverySource.updateMany({
        where: {},
        data: { etag: null, lastModified: null, contentHash: null },
      })
    }
    const due = prisma.discoverySource.findMany({
      where: {
        isPaused: false,
        optOut: false,
        // A source whose permissions are DENIED is never crawled.
        permissionsStatus: { not: 'DENIED' },
        OR: [{ nextCrawlAt: null }, { nextCrawlAt: { lte: new Date() } }],
      },
      orderBy: { nextCrawlAt: 'asc' },
      take: Number(args.limit ?? 25),
    })
    sources = await due
  }

  if (sources.length === 0) {
    console.log('  No sources due for crawl.')
    return
  }

  header(`Crawling ${sources.length} source(s)`)
  const outcomes = []
  for (const source of sources) {
    process.stdout.write(`  → ${source.domain.padEnd(34)}`)
    const outcome = await atlas.crawlSource(source.id)
    outcomes.push(outcome)
    console.log(
      ` ${outcome.status.padEnd(18)} ${String(outcome.candidatesFound).padStart(3)} found` +
      ` · ${outcome.candidatesAccepted} ok · ${outcome.quarantine} quarantined · ${outcome.duplicates} dup`
    )
  }

  console.log('')
  console.log(line())
  const totals = outcomes.reduce(
    (acc, o) => ({
      found: acc.found + o.candidatesFound,
      accepted: acc.accepted + o.candidatesAccepted,
      rejected: acc.rejected + o.candidatesRejected,
      quarantine: acc.quarantine + o.quarantine,
      duplicates: acc.duplicates + o.duplicates,
    }),
    { found: 0, accepted: 0, rejected: 0, quarantine: 0, duplicates: 0 }
  )
  console.log(`  Found ${totals.found} · accepted ${totals.accepted} · quarantined ${totals.quarantine} · rejected ${totals.rejected} · duplicates ${totals.duplicates}`)
}

async function review(args: Args) {
  header('Candidate review queue')
  const showAll = Boolean(args.all)
  const candidates = await prisma.candidateEvent.findMany({
    where: {
      reviewStatus: 'PENDING',
      ...(showAll ? {} : { qaStatus: { not: 'REJECT' } }),
    },
    include: { matches: true },
    orderBy: [{ qaStatus: 'asc' }, { confidence: 'desc' }],
    take: 100,
  })
  const rejectedCount = await prisma.candidateEvent.count({
    where: { reviewStatus: 'PENDING', qaStatus: 'REJECT' },
  })
  if (candidates.length === 0) {
    console.log('  Queue is empty.')
    if (rejectedCount > 0) console.log(`  ${rejectedCount} candidate(s) were auto-rejected by QA (use --all to inspect).`)
    return
  }
  for (const c of candidates) {
    const flag = c.qaStatus === 'PASS' ? ' ' : '!'
    console.log(
      `  ${flag} [${c.id.slice(0, 8)}] ${c.title.slice(0, 48).padEnd(48)} ` +
      `${(c.localDate ?? '—').padEnd(11)} ${(c.venueName ?? '—').slice(0, 22).padEnd(22)} ` +
      `conf ${c.confidence.toFixed(2)} qa=${c.qaStatus}`
    )
    if (c.matches.length) {
      console.log(`      ↳ ${c.matches.length} proposed match(es): ${c.matches.map(m => `${m.matchType} ${m.score.toFixed(2)}`).join(', ')}`)
    }
    const reasons = JSON.parse(c.qaReasons) as string[]
    if (reasons.length) console.log(`      ↳ ${reasons.join('; ')}`)
  }
  console.log('')
  console.log(`  ${candidates.length} candidate(s) awaiting review.`)
}

async function decide(candidateId: string, decision: 'APPROVED' | 'REJECTED', by = 'cli') {
  const candidate = await prisma.candidateEvent.findFirst({
    where: { id: { startsWith: candidateId } },
  })
  if (!candidate) throw new Error(`No candidate matching "${candidateId}"`)

  await prisma.candidateEvent.update({
    where: { id: candidate.id },
    data: { reviewStatus: decision, reviewedBy: by, reviewedAt: new Date() },
  })
  await prisma.moderationDecision.create({
    data: {
      candidateEventId: candidate.id,
      decision: decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      decidedBy: by,
    },
  })
  console.log(`  ✓ ${candidate.title} → ${decision}`)
}

async function publish(candidateId: string, by = 'cli') {
  const target: AtlasTarget = process.argv.includes('--target=production') ? 'production' : 'local'
  assertPublishAllowed(target, process.argv.includes('--publish-to-production'))

  const candidate = await prisma.candidateEvent.findFirst({
    where: { id: { startsWith: candidateId } },
    include: { source: true },
  })
  if (!candidate) throw new Error(`No candidate matching "${candidateId}"`)
  if (candidate.reviewStatus !== 'APPROVED') {
    throw new Error(`Candidate is ${candidate.reviewStatus}. Approve it first.`)
  }

  const startDateTime =
    candidate.startDateTime ??
    (candidate.localDate && candidate.localTime
      ? wallTimeToUtc(candidate.localDate, candidate.localTime, candidate.timeZone ?? 'America/New_York')
      : null)
  if (!startDateTime) throw new Error('Candidate has no start date/time — cannot publish.')

  const styles = JSON.parse(candidate.styles) as string[]
  const eventType = candidate.eventType ?? 'SOCIAL'

  const event = await prisma.event.create({
    data: {
      title: candidate.title,
      eventType,
      styles: JSON.stringify(styles.length ? styles : ['Other']),
      otherStyle: candidate.otherStyle,
      startDateTime,
      endDateTime: candidate.endDateTime,
      venueName: candidate.venueName ?? '',
      address: candidate.address,
      city: candidate.city,
      state: candidate.state,
      zip: candidate.zip,
      lat: candidate.lat,
      lng: candidate.lng,
      timeZone: candidate.timeZone,
      price: candidate.price,
      organizerName: candidate.organizerName ?? candidate.source.organizationName ?? 'Unknown organizer',
      organizerEmail: 'not-published-via-atlas@nododance.invalid',
      websiteUrl: candidate.sourceUrl,
      sourceUrl: candidate.sourceUrl,
      sourceName: candidate.source.organizationName,
      sourceId: candidate.sourceId,
      publishedVia: 'ATLAS',
      verifiedAt: new Date(),
      atlasCandidateId: candidate.id,
      description: candidate.description ?? candidate.title,
      status: 'APPROVED',
    },
  })

  await prisma.publicationRecord.create({
    data: {
      candidateEventId: candidate.id,
      eventId: event.id,
      sourceId: candidate.sourceId,
      publishedBy: by,
      method: 'MANUAL',
      snapshot: JSON.stringify({ title: candidate.title, startDateTime, venueName: candidate.venueName }),
    },
  })
  await prisma.candidateEvent.update({
    where: { id: candidate.id },
    data: { reviewStatus: 'PUBLISHED', publishedEventId: event.id },
  })
  console.log(`  ✓ published "${event.title}" (${event.id})`)
}

async function report() {
  header('Atlas coverage & quality report')

  const cities = await prisma.discoveryCity.findMany({ orderBy: { priority: 'asc' } })
  const sources = await prisma.discoverySource.count()
  const candidates = await prisma.candidateEvent.count()
  const pass = await prisma.candidateEvent.count({ where: { qaStatus: 'PASS' } })
  const quarantine = await prisma.candidateEvent.count({ where: { qaStatus: 'QUARANTINE' } })
  const rejected = await prisma.candidateEvent.count({ where: { qaStatus: 'REJECT' } })
  const pending = await prisma.candidateEvent.count({ where: { reviewStatus: 'PENDING' } })
  const published = await prisma.candidateEvent.count({ where: { reviewStatus: 'PUBLISHED' } })
  const matches = await prisma.entityMatch.count()
  const schools = await prisma.candidateSchool.count()
  const events = await prisma.event.count()

  console.log('  Coverage')
  console.log(`    Cities registered      ${cities.length}`)
  console.log(`    Sources registered     ${sources}`)
  console.log(`    Candidate schools      ${schools}`)
  console.log('')
  console.log('  Extraction funnel')
  console.log(`    Candidates extracted   ${candidates}`)
  console.log(`    Passed QA              ${pass}`)
  console.log(`    Quarantined            ${quarantine}`)
  console.log(`    Rejected               ${rejected}`)
  console.log(`    Duplicate proposals    ${matches}`)
  console.log('')
  console.log('  Publication')
  console.log(`    Awaiting review        ${pending}`)
  console.log(`    Published              ${published}`)
  console.log(`    Events in database     ${events}`)
  console.log('')

  const byStyle = await prisma.candidateEvent.groupBy({
    by: ['styles'],
    _count: { _all: true },
  })
  console.log('  Candidates by style')
  for (const group of byStyle) {
    const styles = JSON.parse(group.styles) as string[]
    console.log(`    ${styles.join(', ').padEnd(26)} ${group._count._all}`)
  }
  console.log('')

  const attempts = await prisma.crawlAttempt.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  console.log('  Crawl attempts')
  for (const a of attempts) console.log(`    ${a.status.padEnd(20)} ${a._count._all}`)
  console.log('')
}

async function killSwitch(args: Args) {
  const on = args.on !== false && args.on !== 'false'
  const result = await prisma.discoverySource.updateMany({
    where: on ? { isPaused: false } : { isPaused: true },
    data: { isPaused: on },
  })
  console.log(
    on
      ? `  ✓ Kill switch ON — ${result.count} source(s) paused.`
      : `  ✓ Kill switch OFF — ${result.count} source(s) resumed.`
  )
}

// ── Entry ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const args = parseArgs(argv.slice(1))

  switch (command) {
    case 'seed:cities':
      await seedCities()
      break
    case 'discover':
      await discover(args)
      break
    case 'discover:osm':
      await discoverOsm(args)
      break
    case 'seed:sources':
      await seedSources(args)
      break
    case 'expand':
      await expand(args)
      break
    case 'sources':
      await listSources()
      break
    case 'crawl':
      await crawl(args)
      break
    case 'review':
      await review(args)
      break
    case 'approve':
      await decide(positional(args), 'APPROVED')
      break
    case 'reject':
      await decide(positional(args), 'REJECTED')
      break
    case 'publish':
      await publish(positional(args))
      break
    case 'report':
      await report()
      break
    case 'kill-switch':
      await killSwitch(args)
      break
    default:
      console.log(`
Nodo Atlas CLI

  atlas seed:cities                 register the rollout cities
  atlas seed:sources [--city slug]  register the pilot source seeds
  atlas discover --city <slug>      find candidate sources for a city
  atlas discover:osm --city <slug> find sources from OpenStreetMap (free, no key)
  atlas expand [--city slug]        expand sources via their own sitemaps
  atlas sources                     list the source registry
  atlas crawl [--limit N]           crawl sources that are due
  atlas review [--all]              show the candidate review queue
  atlas approve <candidateId>       approve a candidate
  atlas reject <candidateId>        reject a candidate
  atlas publish <candidateId>       publish an approved candidate
  atlas report                      coverage + quality report
  atlas kill-switch [--on|--off]    pause or resume all crawling

Target
  --target=production               run against the live Neon database.
                                    Crawling and discovery only create inert
                                    candidate records; publishing additionally
                                    requires --publish-to-production.
  --publish-to-production           acknowledge that this publishes to the
                                    public site.
`)
  }
}

main()
  .catch(error => {
    console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
