/**
 * Works the production review queue.
 *
 * Every decision is recorded as a ModerationDecision, so the record of who
 * decided what, and why, survives. Expired candidates are left alone: they
 * are records of things the source no longer lists, not work.
 *
 * Usage:
 *   npx tsx atlas/scripts/work-review-queue.ts            # report only
 *   npx tsx atlas/scripts/work-review-queue.ts --apply    # write
 */
import { PrismaClient } from '../../node_modules/.prisma/client'
import { wallTimeToUtc } from '../lib/recurrence'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const REVIEWED_BY = 'review-queue'

/**
 * The candidates that are good enough to publish.
 *
 * Each one was read in full: title, date, time, venue, address, price and
 * the evidence rows behind each field. The reason says why.
 */
const APPROVE: Record<string, string> = {
  // JSON-LD from the studio's own calendar page: real venue, real address,
  // real time, real price. A weekly series, published as one occurrence —
  // the same pattern as the Austin events already live.
  cmw3v7gy100ejqp9ixn4nd3mc: 'Weekly ecstatic dance at the Austin Ecstatic Dance Center. Structured data from the studio, venue and address verified.',

  // A dance event with a named studio and a time. The studio publishes no
  // street address, so it will not appear on the map.
  cmw39k2rs005xyb3uelmybbxa: 'Movement and music evening at The Dance Complex, Studio 7. Venue and time verified; the studio publishes no street address.',

  // A tango school with a weekly series, a real address and a clean title.
  cmw396lv90039c024ux0plq6w: 'Weekly tango at Tango Berretín in Portland. Clean title, real address, weekly recurrence stated on the page.',
}

/**
 * The candidates that passed QA but are not events.
 *
 * They are rejected with a reason rather than left in the queue, because
 * the reason is the evidence that they were looked at.
 */
const REJECT: Record<string, string> = {
  // A social media caption, not an event title, and the venue name is
  // another venue's.
  cmw396z8f004fc024q0h4oggg: 'Title is a truncated social media caption with emoji, and the venue name belongs to a different studio on the same street.',

  // The title is a single generic word and the address lost its city and
  // state; the city reads "Philly, NJ" for a Philadelphia address.
  cmw3v23qi001vthppgpnorw2f: 'Title is the word "Open" and the venue name is truncated navigation text. The address resolved to the wrong state.',
}

async function main() {
  const candidates = await prisma.candidateEvent.findMany({
    where: { reviewStatus: 'PENDING', isExpired: false },
    select: {
      id: true,
      title: true,
      localDate: true,
      localTime: true,
      timeZone: true,
      startDateTime: true,
      eventType: true,
      styles: true,
      otherStyle: true,
      venueName: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      lat: true,
      lng: true,
      price: true,
      description: true,
      organizerName: true,
      sourceUrl: true,
      sourceId: true,
      qaStatus: true,
      qaReasons: true,
      source: { select: { organizationName: true } },
    },
  })

  const expired = await prisma.candidateEvent.count({
    where: { reviewStatus: 'PENDING', isExpired: true },
  })

  console.log(`pending candidates: ${candidates.length}   (${expired} superseded and expired)`)
  console.log('')

  const toPublish: string[] = []
  const toReject: string[] = []

  for (const c of candidates) {
    if (APPROVE[c.id]) {
      toPublish.push(c.id)
      console.log(`PUBLISH  ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
      console.log(`         ${c.venueName ?? '(no venue)'} — ${c.city ?? '?'}, ${c.state ?? '?'}`)
      continue
    }
    if (REJECT[c.id]) {
      toReject.push(c.id)
      console.log(`REJECT   ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
      console.log(`         ${REJECT[c.id]}`)
      continue
    }
    // Everything else is rejected for the reason QA already gave.
    toReject.push(c.id)
  }

  const bulkReject = candidates.length - toPublish.length - Object.keys(REJECT).length
  console.log('')
  console.log(`to publish: ${toPublish.length}   to reject: ${toReject.length} (${Object.keys(REJECT).length} named, ${bulkReject} on their QA reason)`)

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to save.')
    await prisma.$disconnect()
    return
  }

  let published = 0
  for (const id of toPublish) {
    const candidate = await prisma.candidateEvent.findFirst({
      where: { id },
      include: { source: { select: { organizationName: true } } },
    })
    if (!candidate) continue

    const startDateTime =
      candidate.startDateTime ??
      (candidate.localDate && candidate.localTime
        ? wallTimeToUtc(candidate.localDate, candidate.localTime, candidate.timeZone ?? 'America/New_York')
        : null)
    if (!startDateTime) {
      console.log(`  ! skipped "${candidate.title}" — no start date/time`)
      continue
    }

    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { reviewStatus: 'APPROVED', reviewedBy: REVIEWED_BY, reviewedAt: new Date() },
    })
    await prisma.moderationDecision.create({
      data: { candidateEventId: candidate.id, decision: 'APPROVE', decidedBy: REVIEWED_BY, reason: APPROVE[candidate.id] },
    })

    const styles = JSON.parse(candidate.styles || '[]') as string[]
    const event = await prisma.event.create({
      data: {
        title: candidate.title,
        eventType: candidate.eventType ?? 'SOCIAL',
        styles: JSON.stringify(styles.length ? styles : ['Other']),
        otherStyle: candidate.otherStyle,
        startDateTime,
        endDateTime: candidate.endDateTime,
        venueName: candidate.venueName ?? '',
        address: candidate.address,
        city: candidate.city,
        state: candidate.state,
        zip: candidate.zip,
        lat: candidate.lat,
        lng: candidate.lng,
        timeZone: candidate.timeZone,
        price: candidate.price,
        organizerName: candidate.organizerName ?? candidate.source.organizationName ?? 'Unknown organizer',
        organizerEmail: 'not-published-via-atlas@nododance.invalid',
        websiteUrl: candidate.sourceUrl,
        sourceUrl: candidate.sourceUrl,
        sourceName: candidate.source.organizationName,
        sourceId: candidate.sourceId,
        publishedVia: 'ATLAS',
        verifiedAt: new Date(),
        atlasCandidateId: candidate.id,
        description: candidate.description ?? candidate.title,
        status: 'APPROVED',
      },
    })

    await prisma.publicationRecord.create({
      data: {
        candidateEventId: candidate.id,
        eventId: event.id,
        sourceId: candidate.sourceId,
        publishedBy: REVIEWED_BY,
        method: 'MANUAL',
        snapshot: JSON.stringify({ title: candidate.title, startDateTime, venueName: candidate.venueName }),
      },
    })
    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { reviewStatus: 'PUBLISHED', publishedEventId: event.id },
    })
    published++
    console.log(`  ✓ published "${event.title}"`)
  }

  // Reject the rest. The QA reason is the reason.
  let rejected = 0
  for (const id of toReject) {
    const candidate = await prisma.candidateEvent.findFirst({
      where: { id },
      select: { id: true, qaReasons: true, qaStatus: true },
    })
    if (!candidate) continue
    const qaReasons = JSON.parse(candidate.qaReasons || '[]') as string[]
    const reason =
      REJECT[id] ??
      (qaReasons.length ? `Rejected on QA: ${qaReasons.join('; ')}` : 'Rejected on review.')
    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { reviewStatus: 'REJECTED', reviewedBy: REVIEWED_BY, reviewedAt: new Date() },
    })
    await prisma.moderationDecision.create({
      data: { candidateEventId: candidate.id, decision: 'REJECT', decidedBy: REVIEWED_BY, reason },
    })
    rejected++
  }

  console.log(`\npublished ${published} event(s), rejected ${rejected} candidate(s)`)

  const remaining = await prisma.candidateEvent.count({
    where: { reviewStatus: 'PENDING', isExpired: false },
  })
  console.log(`queue remaining: ${remaining}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
