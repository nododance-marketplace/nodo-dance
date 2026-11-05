import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Atlas } from '@atlas/lib/pipeline'
import { Fetcher } from '@atlas/lib/fetcher'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/atlas/tick
 *
 * Scheduler entry point. Vercel Cron calls this once a day (see vercel.json).
 * It selects the sources that are due for a re-check and crawls them.
 *
 * The crawl runs here, inline, because this endpoint is the only thing that
 * runs on a schedule. Writing job rows and waiting for a worker to drain
 * them was the previous design, and nothing ever drained them: the queue
 * filled and no source was ever re-checked.
 *
 * The run is bounded by ATLAS_MAX_SOURCES so it finishes inside the serverless
 * timeout, and one failing source never stops the others.
 *
 * Security: Vercel sends `Authorization: Bearer $CRON_SECRET`. When
 * CRON_SECRET is not configured the endpoint refuses to run, so it can never
 * be triggered from the public internet by accident.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured — the Atlas scheduler is disabled.' },
      { status: 503 }
    )
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const maxSources = Math.min(Number(process.env.ATLAS_MAX_SOURCES ?? 10), 50)
  const now = new Date()

  const due = await prisma.discoverySource.findMany({
    where: {
      isPaused: false,
      optOut: false,
      permissionsStatus: { not: 'DENIED' },
      OR: [{ nextCrawlAt: null }, { nextCrawlAt: { lte: now } }],
    },
    orderBy: { nextCrawlAt: 'asc' },
    take: maxSources,
    include: { city: { select: { slug: true, name: true, timeZone: true } } },
  })

  if (due.length === 0) {
    return NextResponse.json({ ok: true, scheduled: 0, results: [] })
  }

  const fetcher = new Fetcher({ politenessDelayMs: 2500 })
  const atlas = new Atlas({ prisma, fetcher })

  const results: Array<{
    domain: string
    status: string
    found: number
    accepted: number
    quarantined: number
    rejected: number
    error?: string
  }> = []

  for (const source of due) {
    try {
      const outcome = await atlas.crawlSource(source.id)
      results.push({
        domain: source.domain,
        status: outcome.status,
        found: outcome.candidatesFound,
        accepted: outcome.candidatesAccepted,
        quarantined: outcome.quarantine,
        rejected: outcome.candidatesRejected,
        ...(outcome.error ? { error: outcome.error } : {}),
      })
    } catch (error) {
      // One bad source must never abort the run.
      const message = error instanceof Error ? error.message : String(error)
      results.push({
        domain: source.domain,
        status: 'FAILED',
        found: 0,
        accepted: 0,
        quarantined: 0,
        rejected: 0,
        error: message.slice(0, 200),
      })
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      found: acc.found + r.found,
      accepted: acc.accepted + r.accepted,
      quarantined: acc.quarantined + r.quarantined,
      rejected: acc.rejected + r.rejected,
      failed: acc.failed + (r.status === 'FAILED' ? 1 : 0),
    }),
    { found: 0, accepted: 0, quarantined: 0, rejected: 0, failed: 0 }
  )

  return NextResponse.json({ ok: true, scheduled: results.length, totals, results })
}
