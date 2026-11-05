import { NextRequest } from 'next/server'
import { handle, json, prisma } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/atlas/overview
 *   Coverage + funnel metrics for the Atlas dashboard.
 * POST /api/admin/atlas/overview  { action: 'pause-all' | 'resume-all' }
 *   Global kill switch — stops every crawl until resumed.
 */
export async function GET(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const [
    cities,
    sources,
    sourcesPaused,
    sourcesDenied,
    candidates,
    pass,
    quarantine,
    rejected,
    pending,
    published,
    matches,
    schools,
    events,
    recurring,
  ] = await Promise.all([
    prisma.discoveryCity.count(),
    prisma.discoverySource.count(),
    prisma.discoverySource.count({ where: { isPaused: true } }),
    prisma.discoverySource.count({ where: { permissionsStatus: 'DENIED' } }),
    prisma.candidateEvent.count(),
    prisma.candidateEvent.count({ where: { qaStatus: 'PASS' } }),
    prisma.candidateEvent.count({ where: { qaStatus: 'QUARANTINE' } }),
    prisma.candidateEvent.count({ where: { qaStatus: 'REJECT' } }),
    prisma.candidateEvent.count({ where: { reviewStatus: 'PENDING' } }),
    prisma.candidateEvent.count({ where: { reviewStatus: 'PUBLISHED' } }),
    prisma.entityMatch.count(),
    prisma.candidateSchool.count(),
    prisma.event.count({ where: { publishedVia: 'ATLAS' } }),
    prisma.candidateEvent.count({ where: { isRecurring: true } }),
  ])

  const byCity = await prisma.discoveryCity.findMany({
    orderBy: { priority: 'asc' },
    include: {
      sources: {
        select: {
          id: true,
          lastSuccessAt: true,
          robotsStatus: true,
          isPaused: true,
          _count: { select: { candidates: true } },
        },
      },
    },
  })

  const attempts = await prisma.crawlAttempt.groupBy({
    by: ['status'],
    _count: { _all: true },
  })

  const freshSources = await prisma.discoverySource.count({
    where: { lastSuccessAt: { gte: new Date(Date.now() - 7 * 86400000) } },
  })

  return json({
    cities,
    sources,
    sourcesPaused,
    sourcesDenied,
    candidates,
    pass,
    quarantine,
    rejected,
    pending,
    published,
    matches,
    schools,
    publishedEvents: events,
    recurring,
    freshSources,
    attempts: attempts.map(a => ({ status: a.status, count: a._count._all })),
    byCity: byCity.map(c => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      status: c.status,
      timeZone: c.timeZone,
      sources: c.sources.length,
      paused: c.sources.filter(s => s.isPaused).length,
      fresh: c.sources.filter(s => s.lastSuccessAt && s.lastSuccessAt > new Date(Date.now() - 7 * 86400000)).length,
      candidates: c.sources.reduce((sum, s) => sum + s._count.candidates, 0),
    })),
  })
}

export async function POST(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const body = (await req.json().catch(() => ({}))) as { action?: string }
  if (body.action === 'pause-all') {
    const result = await prisma.discoverySource.updateMany({
      where: { isPaused: false },
      data: { isPaused: true },
    })
    return json({ ok: true, paused: result.count })
  }
  if (body.action === 'resume-all') {
    const result = await prisma.discoverySource.updateMany({
      where: { isPaused: true },
      data: { isPaused: false },
    })
    return json({ ok: true, resumed: result.count })
  }
  return json({ error: 'Unknown action' }, { status: 400 })
}
