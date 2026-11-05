import { PrismaClient } from '../../node_modules/.prisma/client'

/**
 * Read-only snapshot of the live Nodo database.
 * Counts only — no writes, no schema changes.
 */

const prisma = new PrismaClient()

async function main() {
  const events = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status='APPROVED')::int AS approved,
           count(*) FILTER (WHERE status='PENDING')::int AS pending,
           count(*) FILTER (WHERE status='REJECTED')::int AS rejected,
           count(*) FILTER (WHERE "isRecurring")::int AS recurring,
           count(DISTINCT "recurrenceGroupId")::int AS series,
           count(DISTINCT "venueName")::int AS venues,
           count(DISTINCT "organizerName")::int AS organizers,
           count(DISTINCT "websiteUrl")::int AS websites,
           min("startDateTime")::date::text AS earliest,
           max("startDateTime")::date::text AS latest
    FROM "Event"`

  const styles = await prisma.$queryRaw<any[]>`
    SELECT styles, count(*)::int AS events
    FROM "Event" WHERE status='APPROVED' GROUP BY styles ORDER BY events DESC LIMIT 12`

  const geo = await prisma.$queryRaw<any[]>`
    SELECT count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int AS geocoded,
           count(*)::int AS total FROM "Event"`

  const states = await prisma.$queryRaw<any[]>`
    SELECT coalesce(substring(address from ',\\s*([A-Z]{2})\\s*[0-9]{5}'), 'unknown') AS state,
           count(*)::int AS events
    FROM "Event" WHERE status='APPROVED' GROUP BY 1 ORDER BY events DESC LIMIT 10`

  const instructors = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int AS profiles,
           count(*) FILTER (WHERE "isPublished")::int AS published,
           count(*) FILTER (WHERE "websiteUrl" IS NOT NULL)::int AS with_website
    FROM "InstructorProfile"`

  const users = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int AS users,
           count(*) FILTER (WHERE role='INSTRUCTOR')::int AS instructors,
           count(*) FILTER (WHERE email <> '')::int AS emails
    FROM "User"`

  const upcoming = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int AS upcoming_events
    FROM "Event" WHERE status='APPROVED' AND "startDateTime" > now()`

  console.log('\n=== LIVE NODO DATABASE ===')
  console.log('EVENTS')
  for (const [k, v] of Object.entries(events[0])) console.log(`  ${k.padEnd(14)} ${v}`)
  console.log(`  upcoming        ${upcoming[0].upcoming_events}`)
  console.log('\nSTYLES (published)')
  for (const s of styles) console.log(`  ${String(s.styles).padEnd(34)} ${s.events}`)
  console.log('\nGEO')
  for (const [k, v] of Object.entries(geo[0])) console.log(`  ${k.padEnd(14)} ${v}`)
  console.log('\nSTATES (from address, approved events)')
  for (const s of states) console.log(`  ${String(s.state).padEnd(10)} ${s.events}`)
  console.log('\nINSTRUCTORS')
  for (const [k, v] of Object.entries(instructors[0])) console.log(`  ${k.padEnd(14)} ${v}`)
  console.log('\nUSERS')
  for (const [k, v] of Object.entries(users[0])) console.log(`  ${k.padEnd(14)} ${v}`)
}

main()
  .catch(e => { console.error('FAILED:', e.message) })
  .finally(() => prisma.$disconnect())
