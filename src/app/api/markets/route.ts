import { NextResponse } from 'next/server'
import { marketSummaries } from '@/lib/markets-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/markets
 *
 * Every market the site knows about, each with how many upcoming events it
 * has right now: the curated ones and every town the registry has found a
 * studio in.
 */
export async function GET() {
  const markets = await marketSummaries()

  const live = markets
    .filter((m) => m.events > 0)
    .sort((a, b) => b.events - a.events)

  const total = live.reduce((sum, m) => sum + m.events, 0)

  return NextResponse.json({
    markets: live.map((m) => ({
      slug: m.slug,
      name: m.name,
      state: m.state,
      label: m.label,
      tagline: m.tagline,
      events: m.events,
    })),
    total,
  })
}
