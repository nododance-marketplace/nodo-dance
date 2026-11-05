import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'

export const dynamic = 'force-dynamic'

/**
 * GET /api/markets
 *
 * The list of markets, each with how many upcoming events it has right now.
 * The switcher uses it so it only offers a city that actually has something
 * to show.
 */
export async function GET() {
  const now = new Date()

  const counts = await prisma.event.groupBy({
    by: ['city'],
    where: { status: 'APPROVED', startDateTime: { gte: now } },
    _count: { _all: true },
  })

  const byCity = new Map(counts.map((c) => [c.city ?? '', c._count._all]))

  const markets = MARKETS.map((m) => {
    const events = m.cities.reduce((sum, city) => sum + (byCity.get(city) ?? 0), 0)
    return {
      slug: m.slug,
      name: m.name,
      state: m.state,
      label: m.label,
      tagline: m.tagline,
      timeZone: m.timeZone,
      center: m.center,
      zoom: m.zoom,
      events,
    }
  }).sort((a, b) => b.events - a.events)

  const total = markets.reduce((sum, m) => sum + m.events, 0)

  return NextResponse.json({ markets, total })
}
