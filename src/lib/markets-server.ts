/**
 * Market lookup that also knows about towns the registry has discovered.
 *
 * src/lib/markets.ts holds the curated markets: the cities with a real
 * scene, their metro boundaries, their map centre and their copy. It is
 * static because a client component needs it.
 *
 * But a statewide directory has more places than anyone wants to write by
 * hand. The Atlas registry holds every town it has found a studio in, so a
 * town that is not on the curated list still gets a landing page and still
 * filters its events.
 *
 * This module is the server-side half, and it is the only place that reads
 * the database for a market.
 */
import { prisma } from './prisma'
import { marketBySlug, MARKETS, type Market } from './markets'

export interface ResolvedMarket {
  slug: string
  name: string
  state: string
  label: string
  cities: string[]
  tagline?: string
  center?: [number, number]
  zoom?: number
  timeZone?: string
  /** True when the market came from the curated list rather than the registry. */
  curated: boolean
}

export async function resolveMarket(slug: string | null | undefined): Promise<ResolvedMarket | null> {
  if (!slug) return null

  const curated: Market | null = marketBySlug(slug)
  if (curated) {
    return {
      slug: curated.slug,
      name: curated.name,
      state: curated.state,
      label: curated.label,
      cities: curated.cities,
      tagline: curated.tagline,
      center: curated.center,
      zoom: curated.zoom,
      timeZone: curated.timeZone,
      curated: true,
    }
  }

  const city = await prisma.discoveryCity.findUnique({ where: { slug } })
  if (!city) return null

  // The registry writes towns as "charlotte-nc" and the curated list calls
  // the same place "charlotte". Both have to reach the same market.
  const curatedMatch = MARKETS.find(
    (m) => m.name.toLowerCase() === city.name.toLowerCase() && m.state === city.state
  )
  if (curatedMatch) {
    return {
      slug: curatedMatch.slug,
      name: curatedMatch.name,
      state: curatedMatch.state,
      label: curatedMatch.label,
      cities: curatedMatch.cities,
      tagline: curatedMatch.tagline,
      center: curatedMatch.center,
      zoom: curatedMatch.zoom,
      timeZone: curatedMatch.timeZone,
      curated: true,
    }
  }

  return {
    slug: city.slug,
    name: city.name,
    state: city.state,
    label: `${city.name}, ${city.state}`,
    cities: [city.name],
    timeZone: city.timeZone,
    curated: false,
  }
}

/**
 * Every market the site knows about: the curated ones and every town in
 * the registry, with how many upcoming events each has.
 */
export async function marketSummaries(): Promise<
  Array<ResolvedMarket & { events: number }>
> {
  const counts = await prisma.event.groupBy({
    by: ['city'],
    where: { status: 'APPROVED', startDateTime: { gte: new Date() } },
    _count: { _all: true },
  })
  const byCity = new Map(counts.map((c) => [c.city ?? '', c._count._all]))

  const curated = MARKETS.map((m) => ({
    slug: m.slug,
    name: m.name,
    state: m.state,
    label: m.label,
    cities: m.cities,
    tagline: m.tagline,
    center: m.center,
    zoom: m.zoom,
    timeZone: m.timeZone,
    curated: true,
    events: m.cities.reduce((sum, city) => sum + (byCity.get(city) ?? 0), 0),
  }))

  const registry = await prisma.discoveryCity.findMany({
    select: { slug: true, name: true, state: true, timeZone: true, notes: true },
    orderBy: { name: 'asc' },
  })

  // A curated market and a registry town can be the same place under
  // different slugs - "charlotte" and "charlotte-nc". One city, one entry.
  const curatedPlaces = new Set(
    curated.map((m) => `${m.name.toLowerCase()}|${m.state.toLowerCase()}`)
  )
  const seen = new Set(curated.map((m) => m.slug))
  const towns = registry
    .filter((c) => !seen.has(c.slug))
    .filter((c) => !curatedPlaces.has(`${c.name.toLowerCase()}|${c.state.toLowerCase()}`))
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      label: `${c.name}, ${c.state}`,
      cities: [c.name],
      tagline: c.notes ?? undefined,
      timeZone: c.timeZone,
      curated: false,
      events: byCity.get(c.name) ?? 0,
    }))

  return [...curated, ...towns]
}
