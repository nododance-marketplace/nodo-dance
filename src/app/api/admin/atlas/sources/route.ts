import { NextRequest } from 'next/server'
import { handle, json, prisma } from '../_lib'

export const dynamic = 'force-dynamic'

/**
 * GET   /api/admin/atlas/sources
 *   The source registry with health and permissions.
 * PATCH /api/admin/atlas/sources
 *   { id, action: 'pause' | 'resume' | 'set-permissions', permissionsStatus }
 */
export async function GET(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const sources = await prisma.discoverySource.findMany({
    orderBy: [{ city: { slug: 'asc' } }, { domain: 'asc' }],
    include: {
      city: { select: { slug: true, name: true, state: true } },
      _count: { select: { candidates: true } },
    },
  })

  return json({
    sources: sources.map(s => ({
      id: s.id,
      url: s.url,
      domain: s.domain,
      organizationName: s.organizationName,
      city: s.city?.name ?? null,
      citySlug: s.city?.slug ?? null,
      sourceCategory: s.sourceCategory,
      sourceType: s.sourceType,
      supportedStyles: JSON.parse(s.supportedStyles || '[]'),
      robotsStatus: s.robotsStatus,
      robotsDetail: s.robotsDetail,
      permissionsStatus: s.permissionsStatus,
      isPaused: s.isPaused,
      optOut: s.optOut,
      reliability: s.reliability,
      extractionSuccessRate: s.extractionSuccessRate,
      lastCrawledAt: s.lastCrawledAt,
      lastSuccessAt: s.lastSuccessAt,
      nextCrawlAt: s.nextCrawlAt,
      crawlIntervalDays: s.crawlIntervalDays,
      consecutiveFailures: s.consecutiveFailures,
      discoveredVia: s.discoveredVia,
      candidates: s._count.candidates,
      notes: s.notes,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const guard = await handle(req)
  if (guard) return guard

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    action?: string
    permissionsStatus?: string
    crawlIntervalDays?: number
    optOut?: boolean
  }

  if (!body.id) return json({ error: 'id is required' }, { status: 400 })

  const source = await prisma.discoverySource.findUnique({ where: { id: body.id } })
  if (!source) return json({ error: 'Source not found' }, { status: 404 })

  const data: Record<string, unknown> = {}

  switch (body.action) {
    case 'pause':
      data.isPaused = true
      break
    case 'resume':
      data.isPaused = false
      break
    case 'set-permissions':
      if (!body.permissionsStatus) return json({ error: 'permissionsStatus is required' }, { status: 400 })
      data.permissionsStatus = body.permissionsStatus
      break
    case 'set-interval':
      if (!body.crawlIntervalDays || body.crawlIntervalDays < 1) {
        return json({ error: 'crawlIntervalDays must be >= 1' }, { status: 400 })
      }
      data.crawlIntervalDays = body.crawlIntervalDays
      data.nextCrawlAt = new Date(Date.now() + body.crawlIntervalDays * 86400000)
      break
    case 'opt-out':
      data.optOut = body.optOut !== false
      if (data.optOut) data.isPaused = true
      break
    default:
      return json({ error: 'Unknown action' }, { status: 400 })
  }

  const updated = await prisma.discoverySource.update({ where: { id: body.id }, data })
  return json({ ok: true, source: updated })
}
