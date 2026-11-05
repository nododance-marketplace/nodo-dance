import { NextRequest } from 'next/server'
import { handle, json, prisma } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET    /api/admin/atlas/candidates?status=PENDING&limit=50
 *   The review queue.
 * PATCH  /api/admin/atlas/candidates
 *   { id, decision: 'APPROVED' | 'REJECTED' | 'PUBLISHED' }
 */
export async function GET(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'PENDING'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const candidates = await prisma.candidateEvent.findMany({
    where: status === 'ALL' ? {} : { reviewStatus: status },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      source: { select: { id: true, url: true, domain: true, organizationName: true, robotsStatus: true, permissionsStatus: true } },
      matches: { select: { id: true, matchType: true, score: true, reason: true, existingEventId: true, status: true } },
      evidence: { select: { fieldName: true, fieldValue: true, method: true, url: true } },
      recurrenceRules: { select: { ruleJson: true, confidence: true, status: true, until: true } },
    },
  })

  return json({
    candidates: candidates.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      eventType: c.eventType,
      styles: JSON.parse(c.styles || '[]'),
      localDate: c.localDate,
      localTime: c.localTime,
      timeZone: c.timeZone,
      isRecurring: c.isRecurring,
      recurrenceText: c.recurrenceText,
      recurrenceRule: c.recurrenceRule ? JSON.parse(c.recurrenceRule) : null,
      recurrenceRules: c.recurrenceRules,
      venueName: c.venueName,
      address: c.address,
      city: c.city,
      state: c.state,
      zip: c.zip,
      price: c.price,
      priceText: c.priceText,
      organizerName: c.organizerName,
      sourceUrl: c.sourceUrl,
      registrationUrl: c.registrationUrl,
      confidence: c.confidence,
      qaStatus: c.qaStatus,
      qaReasons: JSON.parse(c.qaReasons || '[]'),
      reviewStatus: c.reviewStatus,
      source: c.source,
      matches: c.matches,
      evidence: c.evidence,
      createdAt: c.createdAt,
      lastSeenAt: c.lastSeenAt,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    decision?: 'APPROVED' | 'REJECTED' | 'PUBLISHED'
    reason?: string
  }

  if (!body.id || !body.decision) {
    return json({ error: 'id and decision are required' }, { status: 400 })
  }

  const candidate = await prisma.candidateEvent.findUnique({
    where: { id: body.id },
    include: { source: { select: { organizationName: true, domain: true } } },
  })
  if (!candidate) return json({ error: 'Candidate not found' }, { status: 404 })

  const session = await (await import('next-auth')).getServerSession(
    (await import('@/lib/auth')).authOptions
  )
  const decidedBy = session?.user?.email ?? 'admin'

  if (body.decision === 'PUBLISHED') {
    if (candidate.reviewStatus !== 'APPROVED') {
      return json({ error: 'Only approved candidates can be published' }, { status: 400 })
    }
    const startDateTime =
      candidate.startDateTime ??
      (candidate.localDate && candidate.localTime
        ? localToUtc(candidate.localDate, candidate.localTime, candidate.timeZone ?? 'America/New_York')
        : null)
    if (!startDateTime) {
      return json({ error: 'Candidate has no start date/time' }, { status: 400 })
    }

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
        timeZone: candidate.timeZone ?? 'America/New_York',
        price: candidate.price,
        organizerName: candidate.organizerName ?? 'Unknown organizer',
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
        publishedBy: decidedBy,
        method: 'MANUAL',
        snapshot: JSON.stringify({
          title: candidate.title,
          startDateTime,
          venueName: candidate.venueName,
          styles,
        }),
      },
    })
    await prisma.candidateEvent.update({
      where: { id: candidate.id },
      data: { reviewStatus: 'PUBLISHED', publishedEventId: event.id, reviewedBy: decidedBy, reviewedAt: new Date() },
    })
    await prisma.moderationDecision.create({
      data: { candidateEventId: candidate.id, decision: 'PUBLISH', decidedBy, reason: body.reason ?? null },
    })

    return json({ ok: true, publishedEventId: event.id })
  }

  await prisma.candidateEvent.update({
    where: { id: candidate.id },
    data: {
      reviewStatus: body.decision,
      reviewedBy: decidedBy,
      reviewedAt: new Date(),
    },
  })
  await prisma.moderationDecision.create({
    data: {
      candidateEventId: candidate.id,
      decision: body.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
      decidedBy,
      reason: body.reason ?? null,
    },
  })

  return json({ ok: true })
}

/** DST-correct wall-clock → UTC conversion (mirrors atlas/lib/recurrence.ts). */
function localToUtc(localDate: string, localTime: string, timeZone: string): Date | null {
  const d = /(\d{4})-(\d{2})-(\d{2})/.exec(localDate)
  const t = /^(\d{1,2}):(\d{2})/.exec(localTime)
  if (!d || !t) return null
  const naiveUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0)
  const offsetAt = (utcMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(utcMs))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'))
    return asUtc - utcMs
  }
  let guess = naiveUtc - offsetAt(naiveUtc)
  guess = naiveUtc - offsetAt(guess)
  return new Date(guess)
}
