import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/atlas/tick
 *
 * Scheduler entry point. Vercel Cron calls this once a day (see vercel.json).
 * It selects the sources that are due for a re-check and hands them to the
 * ingestion worker.
 *
 * Two modes:
 *  - Inline  (default): performs a small bounded number of crawls inside this
 *    request. Safe on a hobby plan, but keep `maxSources` small.
 *  - Enqueue (ATLAS_MODE=enqueue): only writes CrawlJob rows and returns.
 *    A separate worker (atlas/cli.ts crawl) drains the queue. This is the
 *    recommended mode once volume grows.
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

  const mode = process.env.ATLAS_MODE ?? 'enqueue'
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
    return NextResponse.json({ ok: true, mode, scheduled: 0, sources: [] })
  }

  if (mode === 'enqueue') {
    const jobs = await prisma.crawlJob.createMany({
      data: due.map(source => ({
        sourceId: source.id,
        jobType: 'CRAWL',
        status: 'QUEUED',
        priority: 50,
        scheduledFor: now,
        payload: JSON.stringify({ url: source.url, timeZone: source.city?.timeZone ?? 'America/New_York' }),
      })),
    })
    return NextResponse.json({
      ok: true,
      mode,
      scheduled: jobs.count,
      sources: due.map(s => ({ id: s.id, domain: s.domain, url: s.url })),
    })
  }

  // Inline mode: record the job, and let the external worker pick it up.
  await prisma.crawlJob.createMany({
    data: due.map(source => ({
      sourceId: source.id,
      jobType: 'CRAWL',
      status: 'QUEUED',
      priority: 50,
      scheduledFor: now,
      payload: JSON.stringify({ url: source.url }),
    })),
  })

  return NextResponse.json({
    ok: true,
    mode,
    scheduled: due.length,
    sources: due.map(s => ({ id: s.id, domain: s.domain, url: s.url })),
  })
}
