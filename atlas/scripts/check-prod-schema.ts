import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const cols = await prisma.$queryRawUnsafe<any[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='Event' AND column_name IN
     ('publishedVia','city','state','timeZone','sourceId','atlasCandidateId')
     ORDER BY column_name`
  )
  console.log('Atlas columns present in prod:', cols.length, cols.map(c => c.column_name).join(', ') || '(none)')

  const n = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS c FROM "Event"`)
  console.log('events in prod:', n[0].c)

  for (const table of ['DiscoverySource', 'CandidateEvent', 'CrawlJob', 'Venue', 'RecurrenceRule']) {
    try {
      await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM "${table}"`)
      console.log(`${table}: EXISTS`)
    } catch (e: any) {
      console.log(`${table}: MISSING`)
    }
  }
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
