import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const byState = await prisma.$queryRaw<any[]>`
    SELECT
      CASE
        WHEN "address" ~* ',\s*(NC)\b' THEN 'NC'
        WHEN "address" ~* ',\s*(SC)\b' THEN 'SC'
        WHEN "address" ~* ',\s*(GA)\b' THEN 'GA'
        WHEN "address" ~* ',\s*(TX)\b' THEN 'TX'
        WHEN "address" ~* ',\s*(FL)\b' THEN 'FL'
        WHEN "address" ~* ',\s*(NY)\b' THEN 'NY'
        WHEN "address" ~* ',\s*(IL)\b' THEN 'IL'
        WHEN "address" ~* ',\s*(CA)\b' THEN 'CA'
        WHEN "address" IS NULL THEN 'no address'
        ELSE 'other/unparsed'
      END AS state,
      count(*)::int AS events,
      count(DISTINCT "venueName")::int AS venues,
      count(DISTINCT "organizerName")::int AS organizers
    FROM "Event"
    GROUP BY 1 ORDER BY events DESC`

  console.log('\n=== PRODUCTION EVENTS BY STATE ===')
  for (const r of byState) {
    console.log(`  ${String(r.state).padEnd(16)} ${String(r.events).padStart(4)} events   ${r.venues} venues   ${r.organizers} organizers`)
  }

  const cities = await prisma.$queryRaw<any[]>`
    SELECT "venueName" AS venue, "address" AS address, count(*)::int AS events,
           min("startDateTime")::date::text AS first, max("startDateTime")::date::text AS last
    FROM "Event" GROUP BY 1,2 ORDER BY events DESC LIMIT 18`

  console.log('\n=== VENUES ===')
  for (const c of cities) {
    console.log(`  ${String(c.venue).slice(0, 30).padEnd(32)} ${String(c.address ?? '').slice(0, 34).padEnd(36)} ${String(c.events).padStart(3)} ev  ${c.first} → ${c.last}`)
  }

  const atlasTables = await prisma.$queryRaw<any[]>`
    SELECT
      (SELECT count(*)::int FROM "DiscoverySource") AS sources,
      (SELECT count(*)::int FROM "CandidateEvent") AS candidates,
      (SELECT count(*)::int FROM "Event" WHERE "publishedVia" = 'ATLAS') AS atlas_published`

  console.log('\n=== ATLAS IN PRODUCTION ===')
  for (const [k, v] of Object.entries(atlasTables[0])) {
    console.log(`  ${k.padEnd(18)} ${v}`)
  }
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
