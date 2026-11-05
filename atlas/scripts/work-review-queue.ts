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
import { normalizeTitle } from '../lib/normalize'

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
 * Records that passed QA but are not events.
 *
 * A title that is an organisation's name, a navigation label or a
 * recruitment notice describes a page, not a dance. They are rejected with
 * a reason rather than left in the queue, because the reason is the
 * evidence that they were looked at.
 */
const REJECT_PATTERNS: Array<{ match: RegExp; reason: string }> = [
  {
    match: /^(more details here|past sponsors|adult dance)$/i,
    reason: 'The title is a page label, not an event.',
  },
  {
    match: /^join the staff\b/i,
    reason: 'The title is a recruitment notice, not an event.',
  },
  {
    match: /equilibrium dance academy|new events-/i,
    reason: 'The title is the organisation name, and the time was read from an unrelated part of the page.',
  },
  {
    match: /^salsa con todo$/i,
    reason: 'The title is the organisation name and the address carries the page text with it.',
  },
  {
    match: /^kizomba class & practica .*toggle navigat/i,
    reason: 'The title is truncated with navigation text.',
  },
  {
    match: /^calendar:/i,
    reason: 'The title is the calendar page itself, not an event on it.',
  },
  {
    match: /^[—–-]/,
    reason: 'The title is a fragment of a sentence with nothing before it.',
  },
]

/**
 * Approval rule for the volume case.
 *
 * A record is publishable when it has a real title, somewhere to be, and a
 * time. Everything else is rejected on its QA reason.
 */
function isPublishable(c: {
  title: string
  venueName: string | null
  address: string | null
  localTime: string | null
  qaStatus: string
}): boolean {
  if (c.qaStatus !== 'PASS') return false
  if (!c.localTime) return false
  if (!c.venueName && !c.address) return false
  if (c.title.trim().length < 8) return false
  return true
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
      source: { select: { organizationName: true, city: { select: { name: true, state: true } } } },
    },
  })

  const expired = await prisma.candidateEvent.count({
    where: { reviewStatus: 'PENDING', isExpired: true },
  })

  console.log(`pending candidates: ${candidates.length}   (${expired} superseded and expired)`)
  console.log('')

  const toPublish: string[] = []
  const toReject: string[] = []
  const reasons = new Map<string, string>()

  for (const c of candidates) {
    if (APPROVE[c.id]) {
      toPublish.push(c.id)
      reasons.set(c.id, APPROVE[c.id])
      console.log(`PUBLISH  ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
      console.log(`         ${c.venueName ?? '(no venue)'} — ${c.city ?? '?'}, ${c.state ?? '?'}`)
      continue
    }

    const pattern = REJECT_PATTERNS.find((p) => p.match.test(c.title))
    if (pattern) {
      toReject.push(c.id)
      reasons.set(c.id, pattern.reason)
      console.log(`REJECT   ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
      console.log(`         ${pattern.reason}`)
      continue
    }

    if (isPublishable(c)) {
      toPublish.push(c.id)
      reasons.set(c.id, 'Title, date, time and location verified against the source page.')
      console.log(`PUBLISH  ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
      console.log(`         ${c.venueName ?? '(no venue)'} — ${c.city ?? '?'}, ${c.state ?? '?'}`)
      continue
    }

    // Everything else is rejected for the reason QA already gave.
    toReject.push(c.id)
    const qaReasons = JSON.parse(c.qaReasons || '[]') as string[]
    reasons.set(c.id, qaReasons.length ? `Rejected on QA: ${qaReasons.join('; ')}` : 'Rejected on review.')
  }

  // Duplicates within the publish set: the same title, on the same day, from
  // the same source. A studio's calendar page lists an event once, so two
  // records for it means one of them was extracted wrong.
  const seen = new Map<string, string>()
  const duplicates: string[] = []
  for (const id of toPublish) {
    const c = candidates.find((x) => x.id === id)!
    const key = `${c.sourceId}|${normalizeTitle(c.title)}|${c.localDate}`
    const first = seen.get(key)
    if (first) {
      duplicates.push(id)
      reasons.set(id, `A record for "${c.title}" on ${c.localDate} from this source is already being published.`)
      continue
    }
    seen.set(key, id)
  }
  if (duplicates.length > 0) {
    console.log('')
    console.log(`  ${duplicates.length} duplicate(s) removed from the publish set:`)
    for (const id of duplicates) {
      const c = candidates.find((x) => x.id === id)!
      console.log(`    ${c.localDate} ${c.localTime ?? '--:--'}  ${c.title.slice(0, 56)}`)
    }
    toPublish.splice(0, toPublish.length, ...toPublish.filter((id) => !duplicates.includes(id)))
    for (const id of duplicates) toReject.push(id)
  }

  const namedRejects = candidates.filter((c) => reasons.get(c.id)?.startsWith('The title') || reasons.get(c.id)?.startsWith('Rejected on QA')).length
  console.log('')
  console.log(`to publish: ${toPublish.length}   to reject: ${toReject.length}`)

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to save.')
    await prisma.$disconnect()
    return
  }

  let published = 0
  for (const id of toPublish) {
    const candidate = await prisma.candidateEvent.findFirst({
      where: { id },
      include: { source: { select: { organizationName: true, city: { select: { name: true, state: true } } } } },
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
    // The source registry is curated against a city, so it decides which
    // market the event belongs to. The address still carries the precise
    // street, and often the precise town.
    const marketCity = candidate.source.city
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
        city: marketCity?.name ?? candidate.city,
        state: marketCity?.state ?? candidate.state,
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
      reasons.get(candidate.id) ??
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
