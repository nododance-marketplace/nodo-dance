/**
 * One-off: extend selected recurring event series by additional weeks.
 *
 *   Dry-run (default):   npx tsx scripts/extend-recurring-events.ts
 *   Execute:             npx tsx scripts/extend-recurring-events.ts --execute
 *
 * Rules (per user, 2026-04-21):
 *  - Skip any series with recurrenceCount === 44 (both WCS series posted by someone else).
 *  - Extend series with recurrenceCount === 10 by +10 weeks.
 *  - Extend series with recurrenceCount === 12 by +12 weeks.
 *  - Extend "CLT Dance Bachata course" and "CLT Dance Salsa course" by +12 weeks,
 *    but SHIFT their anchor forward: new series starts at the first day-of-week match
 *    at least 7 days from today (their original series already ended in March).
 *  - Skip everything else.
 *  - New rows inherit APPROVED status and all shared fields from the last existing occurrence.
 *  - recurrenceCount is bumped on every row in the group (old + new) to the new total.
 *  - recurrenceIndex on new rows continues from the last existing index.
 *  - recurrenceInterval is respected (weekly=7d, biweekly=14d).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CLT_TITLES = new Set(['CLT Dance Bachata course', 'CLT Dance Salsa course'])

function decideExtension(title: string, count: number): { add: number; reason: string } {
  if (count === 44) return { add: 0, reason: 'WCS (44 occ) — skip per user' }
  if (count === 10) return { add: 10, reason: '10-week series → +10 weeks' }
  if (count === 12) return { add: 12, reason: '12-week series → +12 weeks' }
  if (CLT_TITLES.has(title)) return { add: 12, reason: 'CLT Dance course → +12 weeks' }
  return { add: 0, reason: `not in extend policy (count=${count})` }
}

function fmt(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

async function main() {
  const execute = process.argv.includes('--execute')
  console.log(execute ? '>>> EXECUTE mode (will write to DB)' : '>>> DRY-RUN mode (pass --execute to write)')
  console.log()

  const rows = await prisma.event.findMany({
    where: { recurrenceGroupId: { not: null }, isRecurring: true },
  })

  // Group by recurrenceGroupId, each group sorted chronologically.
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    const g = groups.get(r.recurrenceGroupId!) ?? []
    g.push(r)
    groups.set(r.recurrenceGroupId!, g)
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
  }

  let seriesExtended = 0
  let rowsInserted = 0
  const skipped: { title: string; count: number; reason: string }[] = []

  // Stable iteration order: by title
  const ordered = [...groups.entries()].sort((a, b) =>
    a[1][0].title.localeCompare(b[1][0].title)
  )

  for (const [groupId, events] of ordered) {
    const first = events[0]
    const last = events[events.length - 1]
    const storedCount = first.recurrenceCount ?? events.length
    const title = first.title
    const { add, reason } = decideExtension(title, storedCount)

    if (add === 0) {
      skipped.push({ title, count: storedCount, reason })
      continue
    }

    const intervalDays = (first.recurrenceInterval ?? 1) * 7
    const lastIdx = last.recurrenceIndex ?? events.length
    const newTotal = storedCount + add

    // Anchor for new occurrences: by default, continue from the last existing occurrence.
    // For CLT (whose series already ended in March), shift forward so the new series
    // starts on the first day-of-week match at least 7 days from today.
    let anchorStart = last.startDateTime
    let anchorEnd = last.endDateTime
    let anchorShifted = false
    if (CLT_TITLES.has(title)) {
      const orig = last.startDateTime
      const durationMs = last.endDateTime ? last.endDateTime.getTime() - orig.getTime() : 0
      const minFuture = new Date()
      minFuture.setDate(minFuture.getDate() + 7)
      let candidate = new Date(orig)
      while (candidate.getTime() < minFuture.getTime()) {
        candidate = new Date(candidate.getTime() + intervalDays * 24 * 60 * 60 * 1000)
      }
      // candidate is now the first weekly slot ≥ 7 days from today, matching original day/time.
      // Back it up one interval so the loop below produces it as the first new occurrence.
      anchorStart = new Date(candidate.getTime() - intervalDays * 24 * 60 * 60 * 1000)
      anchorEnd = last.endDateTime ? new Date(anchorStart.getTime() + durationMs) : null
      anchorShifted = true
    }

    const newRows = Array.from({ length: add }, (_, i) => {
      const offsetMs = (i + 1) * intervalDays * 24 * 60 * 60 * 1000
      const occStart = new Date(anchorStart.getTime() + offsetMs)
      const occEnd = anchorEnd ? new Date(anchorEnd.getTime() + offsetMs) : null
      return {
        status: 'APPROVED',
        title: last.title,
        eventType: last.eventType,
        styles: last.styles,
        otherStyle: last.otherStyle,
        startDateTime: occStart,
        endDateTime: occEnd,
        venueName: last.venueName,
        address: last.address,
        lat: last.lat,
        lng: last.lng,
        price: last.price,
        organizerName: last.organizerName,
        organizerEmail: last.organizerEmail,
        instagramUrl: last.instagramUrl,
        websiteUrl: last.websiteUrl,
        description: last.description,
        imageUrl: last.imageUrl,
        submittedByUserId: last.submittedByUserId,
        isRecurring: true,
        recurrenceGroupId: last.recurrenceGroupId,
        recurrenceDay: last.recurrenceDay,
        recurrenceInterval: last.recurrenceInterval,
        recurrenceCount: newTotal,
        recurrenceIndex: lastIdx + i + 1,
      }
    })

    console.log(`EXTEND  ${title}${anchorShifted ? '  [ANCHOR SHIFTED]' : ''}`)
    console.log(`  group:      ${groupId.slice(0, 8)}…  (${reason})`)
    console.log(`  count:      ${storedCount} → ${newTotal} (+${add})`)
    console.log(`  last occ:   ${fmt(last.startDateTime)}`)
    console.log(`  new first:  ${fmt(newRows[0].startDateTime)}  (idx ${newRows[0].recurrenceIndex})`)
    console.log(`  new last:   ${fmt(newRows[newRows.length - 1].startDateTime)}  (idx ${newRows[newRows.length - 1].recurrenceIndex})`)
    console.log()

    if (execute) {
      await prisma.$transaction([
        prisma.event.createMany({ data: newRows }),
        prisma.event.updateMany({
          where: { recurrenceGroupId: groupId },
          data: { recurrenceCount: newTotal },
        }),
      ])
    }

    seriesExtended++
    rowsInserted += add
  }

  console.log('=== SUMMARY ===')
  console.log(`Series extended:  ${seriesExtended}`)
  console.log(`Rows ${execute ? 'inserted' : 'that would be inserted'}: ${rowsInserted}`)
  console.log()
  console.log(`Skipped (${skipped.length}):`)
  for (const s of skipped.sort((a, b) => a.title.localeCompare(b.title))) {
    console.log(`  - ${s.title}  (count=${s.count})  — ${s.reason}`)
  }
  console.log()
  console.log(execute ? 'DONE.' : 'This was a DRY RUN. Re-run with --execute to write.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
