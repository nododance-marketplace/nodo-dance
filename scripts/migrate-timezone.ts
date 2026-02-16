/**
 * One-time migration: fix existing event timestamps.
 *
 * Before this fix, the API parsed "7:00 PM" as 19:00 UTC (wrong).
 * The correct value is 19:00 ET → 00:00 UTC next day (EST) or 23:00 UTC (EDT).
 *
 * This script interprets stored naive-UTC values as America/New_York
 * and converts them to proper UTC.
 *
 * Run once: node --env-file=.env --loader tsx scripts/migrate-timezone.ts
 * WARNING: Not idempotent — running twice will double-shift times.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Sanity check: show a sample event before migration
  const sample = await prisma.event.findFirst({
    select: { id: true, title: true, startDateTime: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!sample) {
    console.log('No events found. Nothing to migrate.')
    return
  }

  console.log('Sample event BEFORE migration:')
  console.log(`  "${sample.title}" → startDateTime: ${sample.startDateTime.toISOString()}`)
  console.log()

  // Ensure session timezone is UTC so the AT TIME ZONE conversion stores UTC values
  await prisma.$executeRaw`SET timezone = 'UTC'`

  // Interpret stored timestamps as America/New_York and convert to proper UTC
  const count = await prisma.$executeRaw`
    UPDATE "Event"
    SET
      "startDateTime" = "startDateTime" AT TIME ZONE 'America/New_York',
      "endDateTime" = CASE
        WHEN "endDateTime" IS NOT NULL
        THEN "endDateTime" AT TIME ZONE 'America/New_York'
        ELSE NULL
      END
  `

  console.log(`Migrated ${count} events.`)
  console.log()

  // Verify: show the same event after migration
  const after = await prisma.event.findUnique({
    where: { id: sample.id },
    select: { title: true, startDateTime: true },
  })

  if (after) {
    console.log('Sample event AFTER migration:')
    console.log(`  "${after.title}" → startDateTime: ${after.startDateTime.toISOString()}`)
    const etTime = after.startDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })
    console.log(`  Displayed in ET: ${etTime}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
