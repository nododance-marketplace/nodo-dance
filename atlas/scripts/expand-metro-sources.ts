/**
 * Runs OpenStreetMap discovery across a set of metros and registers the
 * organisations that publish a public website.
 *
 * Usage: npx tsx atlas/scripts/expand-metro-sources.ts [citySlug ...]
 *        npx tsx atlas/scripts/expand-metro-sources.ts --all --target=production
 */
import { createPrisma, type AtlasPrisma, type AtlasTarget } from '../lib/db'
import { Atlas } from '../lib/pipeline'
import { Fetcher } from '../lib/fetcher'
import { OsmDiscovery, looksLikeDanceOrg, censusQuery, areaQuery, type OsmOrganisation } from '../lib/osm'

const prisma: AtlasPrisma = createPrisma(
  (process.argv.includes('--target=production') ? 'production' : 'local') as AtlasTarget
)

const BBOXES: Record<string, string> = {
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

async function main() {
  const all = process.argv.includes('--all')
  const slugs = process.argv.slice(2).filter(a => !a.startsWith('--'))

  const cities = await prisma.discoveryCity.findMany({ orderBy: { priority: 'asc' } })
  const targets = all ? cities : cities.filter(c => slugs.includes(c.slug))

  const fetcher = new Fetcher({ politenessDelayMs: 1500, requestTimeoutMs: 160000, maxRetries: 0 })
  const osm = new OsmDiscovery(fetcher)
  const atlas = new Atlas({ prisma, fetcher })

  let totalCreated = 0
  let totalFound = 0

  for (const city of targets) {
    const bbox = BBOXES[city.slug] ?? ''
    let all_: OsmOrganisation[] = []
    try {
      all_ = bbox ? await osm.census(censusQuery(bbox)) : []
      if (all_.length === 0) all_ = await osm.census(areaQuery(city.name, city.state))
    } catch {
      console.log(`  ! ${city.name}: lookup failed`)
      continue
    }

    const orgs = all_.filter(looksLikeDanceOrg)
    const ingestible = orgs.filter(o => o.website)
    totalFound += ingestible.length

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
      if (isNew) created++
    }
    totalCreated += created

    console.log(
      `  ${city.name}, ${city.state}: ${all_.length} matches → ${orgs.length} orgs → ${ingestible.length} with a website (${created} new)`
    )
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log(`\n${totalCreated} new source(s) registered from ${totalFound} ingestible organisations.`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
