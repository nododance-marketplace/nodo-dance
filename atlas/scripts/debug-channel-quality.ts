import { createPrisma } from '../lib/db'

async function main() {
  const prisma = createPrisma('local')
  const byMethod = await prisma.candidateEvent.groupBy({
    by: ['qaStatus', 'sourceId'],
    _count: { _all: true },
  })
  const sources = await prisma.discoverySource.findMany({
    where: { discoveredVia: { startsWith: 'CHANNEL' } },
    select: { id: true, domain: true, organizationName: true },
  })
  const map = new Map(sources.map(s => [s.id, s.organizationName]))

  console.log('─ pending channel candidates (qa PASS or QUARANTINE) ─')
  const samples = await prisma.candidateEvent.findMany({
    where: { source: { discoveredVia: { startsWith: 'CHANNEL' } }, reviewStatus: 'PENDING', qaStatus: { in: ['PASS'] } },
    orderBy: { confidence: 'desc' },
    take: 12,
    select: {
      id: true, title: true, localDate: true, localTime: true, venueName: true,
      city: true, state: true, lat: true, lng: true, price: true,
      organizerName: true, confidence: true, qaStatus: true, isRecurring: true,
      source: { select: { discoveredVia: true, organizationName: true } },
    },
  })
  for (const c of samples) {
    const via = c.source.discoveredVia
    console.log(
      `${c.confidence.toFixed(2)} [${via ?? ''}] ${c.title.slice(0, 52).padEnd(54)}` +
      `${(c.localDate ?? '—') + ' ' + (c.localTime ?? '')}`.padEnd(18) +
      `${(c.venueName ?? '—').slice(0, 26).padEnd(28)}` +
      `${c.city ?? ''}, ${c.state ?? ''} lat=${c.lat != null ? c.lat.toFixed(3) : '—'}`
    )
  }

  console.log(`\n${byMethod.length} (qa,sourceId) groups:`)
  for (const g of byMethod) {
    const label = g.sourceId ? map.get(g.sourceId) ?? g.sourceId : '?'
    console.log(`  qa=${g.qaStatus ?? '?'} ${g._count._all} ${label}`)
  }
  await prisma.$disconnect()
}
main()
