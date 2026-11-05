import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const byCity = await prisma.discoverySource.groupBy({
    by: ['cityId'],
    _count: { _all: true },
  })
  const cities = await prisma.discoveryCity.findMany({ select: { id: true, name: true, state: true } })
  const nameOf = new Map(cities.map(c => [c.id, `${c.name}, ${c.state}`]))

  let total = 0
  for (const row of byCity.sort((a, b) => b._count._all - a._count._all)) {
    total += row._count._all
    console.log(`  ${(nameOf.get(row.cityId) ?? 'unassigned').padEnd(24)} ${row._count._all}`)
  }
  console.log(`\ntotal sources registered: ${total}`)

  const candidates = await prisma.candidateEvent.count()
  const pass = await prisma.candidateEvent.count({ where: { qaStatus: 'PASS' } })
  const published = await prisma.candidateEvent.count({ where: { reviewStatus: 'PUBLISHED' } })
  const events = await prisma.event.count({ where: { publishedVia: 'ATLAS' } })
  console.log(`candidates: ${candidates} (${pass} passed QA, ${published} published)`)
  console.log(`Atlas-published events live: ${events}`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
