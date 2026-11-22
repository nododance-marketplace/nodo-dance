/** One-off: crawl an Eventbrite LatAm channel to verify international extraction. Usage: npx tsx atlas/scripts/verify-latam-crawl.ts [city-slug] [style] */
import { createPrisma } from '../lib/db'
import { Atlas } from '../lib/pipeline'
import { Fetcher } from '../lib/fetcher'

const prisma = createPrisma('local')

async function main() {
  const slug = process.argv[2] ?? 'mexico-city-mexico'
  const style = process.argv[3] ?? 'salsa'
  const source = await prisma.discoverySource.findFirst({
    where: {
      domain: 'eventbrite.com',
      discoveredVia: 'CHANNEL_EVENTBRITE',
      city: { slug },
      url: { contains: `/${style}` },
    },
  })
  if (!source) throw new Error(`${slug} Eventbrite ${style} source not found`)
  console.log(`crawling ${source.url}`)
  const atlas = new Atlas({ prisma, fetcher: new Fetcher({ politenessDelayMs: 2500 }) })
  const outcome = await atlas.crawlSource(source.id)
  console.log(JSON.stringify(outcome, null, 2))
  const recent = await prisma.candidateEvent.findMany({
    where: { sourceId: source.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { title: true, city: true, localDate: true, venueName: true, lat: true, lng: true, confidence: true, qaStatus: true },
  })
  console.log(JSON.stringify(recent, null, 2))
}

main()
  .catch(e => {
    console.error('✗', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
