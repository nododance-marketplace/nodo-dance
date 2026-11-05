import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const events = await prisma.event.findMany({
    where: { publishedVia: 'ATLAS' },
    select: {
      title: true, city: true, state: true, zip: true, address: true,
      venueName: true, sourceUrl: true, sourceName: true, verifiedAt: true,
      timeZone: true, price: true, lat: true, lng: true, startDateTime: true,
    },
    orderBy: { startDateTime: 'asc' },
    take: 3,
  })
  for (const e of events) {
    console.log(JSON.stringify(e, null, 2))
    console.log('---')
  }
  const total = await prisma.event.count({ where: { publishedVia: 'ATLAS' } })
  console.log(`total ATLAS-published events: ${total}`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
