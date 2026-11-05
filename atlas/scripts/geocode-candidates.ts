import { PrismaClient } from '../../node_modules/.prisma/client'
import { Geocoder } from '../lib/geocode'

/**
 * Fills in map coordinates for candidates that have an address but no
 * coordinates. A listing without coordinates is invisible on the map, and the
 * map is how people answer "where do I dance tonight?".
 *
 * Safe to run against production: it only writes lat/lng onto candidates that
 * are still awaiting review.
 */
const prisma = new PrismaClient()

async function main() {
  const target = process.argv.includes('--target=production') ? 'production' : 'local'
  const geocoder = new Geocoder()

  const candidates = await prisma.candidateEvent.findMany({
    where: {
      lat: null,
      address: { not: null },
      reviewStatus: 'PENDING',
    },
    select: { id: true, title: true, address: true, city: true, state: true, zip: true },
    take: 60,
  })

  console.log(`${candidates.length} candidate(s) need coordinates`)

  let done = 0
  for (const c of candidates) {
    const result = await geocoder.geocode(c.address ?? '', c.city ?? undefined, c.state ?? undefined)
    if (!result) {
      console.log(`  · no match: ${c.title.slice(0, 44)}`)
      continue
    }
    await prisma.candidateEvent.update({
      where: { id: c.id },
      data: { lat: result.lat, lng: result.lng },
    })
    done++
    console.log(`  ✓ ${c.title.slice(0, 44).padEnd(46)} ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`)
  }

  console.log(`\n${done} candidate(s) geocoded (${geocoder.size} addresses in cache).`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
