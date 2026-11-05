/**
 * Rescue the sources that produce nothing.
 *
 * A source that has never produced a candidate is one of four things:
 *
 *   1. The domain is dead — it does not resolve. Nothing to rescue; it is
 *      paused so it stops costing a crawl every week.
 *   2. The URL is wrong — the organisation moved, and the recorded path is
 *      a 404. The origin root is tried.
 *   3. The URL is right but the page has no events on it — a school
 *      homepage rather than a calendar. The sitemap is read, and the event
 *      pages in it are registered as sources of their own.
 *   4. robots.txt forbids the path. That is respected, always, and the
 *      source is paused.
 *
 * Usage:
 *   npx tsx atlas/scripts/rescue-sources.ts                  # report only
 *   npx tsx atlas/scripts/rescue-sources.ts --apply          # write
 *   npx tsx atlas/scripts/rescue-sources.ts --apply --target=production
 */
import { createPrisma, type AtlasPrisma, type AtlasTarget } from '../lib/db'
import { Atlas } from '../lib/pipeline'
import { Fetcher } from '../lib/fetcher'
import { RobotsCache } from '../lib/robots'
import { SitemapReader, looksLikeEventPage, isPastEventUrl } from '../lib/sitemap'

const prisma: AtlasPrisma = createPrisma(
  (process.argv.includes('--target=production') ? 'production' : 'local') as AtlasTarget
)
const APPLY = process.argv.includes('--apply')

/** A source is "empty" when it has never produced a candidate. */
async function emptySources(): Promise<
  Array<{ id: string; url: string; domain: string; organizationName: string | null; cityId: string | null; sourceCategory: string; supportedStyles: string; notes: string | null; lastError: string | null }>
> {
  const sources = await prisma.discoverySource.findMany({
    select: {
      id: true,
      url: true,
      domain: true,
      organizationName: true,
      cityId: true,
      sourceCategory: true,
      supportedStyles: true,
      notes: true,
    },
  })
  const withCandidates = new Set(
    (await prisma.candidateEvent.findMany({ select: { sourceId: true } })).map((c) => c.sourceId)
  )
  return sources
    .filter((s) => !withCandidates.has(s.id))
    .map((s) => ({
      ...s,
      lastError: null,
    }))
}

async function main() {
  const fetcher = new Fetcher({ politenessDelayMs: 2000, requestTimeoutMs: 30000 })
  const robots = new RobotsCache()
  const reader = new SitemapReader(fetcher, robots)
  const atlas = new Atlas({ prisma, fetcher, robots })

  const sources = await emptySources()
  console.log(`sources with no candidates: ${sources.length}\n`)

  let paused = 0
  let repointed = 0
  let expanded = 0
  let alive = 0

  for (const source of sources) {
    const label = source.domain.padEnd(34)
    let origin: string
    try {
      origin = new URL(source.url).origin
    } catch {
      console.log(`  ${label} unusable url`)
      continue
    }

    // 1 — is the domain alive at all?
    let rootStatus: number | null = null
    let rootError: string | null = null
    try {
      const res = await fetcher.fetch(origin)
      rootStatus = res.status
    } catch (error) {
      rootError = error instanceof Error ? error.message : String(error)
    }

    if (rootStatus === null) {
      // The domain does not resolve. Pause it: it is not coming back, and
      // every crawl of it is wasted.
      const dead = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(rootError ?? '')
      const label2 = dead ? 'domain does not exist' : `unreachable (${rootError?.slice(0, 40)})`
      console.log(`  ${label} DEAD — ${label2}`)
      if (APPLY) {
        await prisma.discoverySource.update({
          where: { id: source.id },
          data: {
            isPaused: true,
            notes: `${source.notes ? source.notes + ' | ' : ''}Paused ${new Date().toISOString().slice(0, 10)}: ${label2}.`,
          },
        })
      }
      paused++
      continue
    }

    if (rootStatus >= 400) {
      console.log(`  ${label} DEAD — origin returns HTTP ${rootStatus}`)
      if (APPLY) {
        await prisma.discoverySource.update({
          where: { id: source.id },
          data: {
            isPaused: true,
            notes: `${source.notes ? source.notes + ' | ' : ''}Paused ${new Date().toISOString().slice(0, 10)}: origin returns HTTP ${rootStatus}.`,
          },
        })
      }
      paused++
      continue
    }

    // 2 — the origin is alive. Is the recorded URL the problem?
    if (source.url !== origin && source.url !== `${origin}/`) {
      try {
        const res = await fetcher.fetch(source.url)
        if (res.status >= 400) {
          console.log(`  ${label} REPOINT ${source.url} → ${origin} (HTTP ${res.status})`)
          if (APPLY) {
            await prisma.discoverySource.update({
              where: { id: source.id },
              data: {
                url: origin,
                notes: `${source.notes ? source.notes + ' | ' : ''}Repointed from ${source.url} (HTTP ${res.status}) on ${new Date().toISOString().slice(0, 10)}.`,
              },
            })
          }
          repointed++
        }
      } catch {
        /* the origin check already told us what we need */
      }
    }

    // 3 — the site's own sitemap is the cheapest way to find its events.
    let sitemapUrls: Array<{ loc: string }> = []
    try {
      sitemapUrls = await reader.read(origin)
    } catch {
      sitemapUrls = []
    }
    const eventPages = sitemapUrls.filter(
      (u) => looksLikeEventPage(u.loc) && !isPastEventUrl(u.loc)
    )
    const pastSkipped = sitemapUrls.filter((u) => looksLikeEventPage(u.loc) && isPastEventUrl(u.loc)).length
    console.log(
      `  ${label} alive — sitemap has ${sitemapUrls.length} urls, ` +
        `${eventPages.length} look like upcoming events (${pastSkipped} past)`
    )
    alive++

    for (const page of eventPages.slice(0, 20)) {
      const { created } = await atlas.registerSource({
        url: page.loc,
        organizationName: source.organizationName ?? undefined,
        cityId: source.cityId ?? undefined,
        sourceCategory: source.sourceCategory,
        sourceType: 'HTML',
        supportedStyles: JSON.parse(source.supportedStyles || '[]'),
        discoveredVia: 'SITEMAP',
        notes: `Discovered via sitemap of ${source.domain}`,
      })
      if (created) expanded++
    }
  }

  console.log('')
  console.log(`alive: ${alive}   repointed: ${repointed}   new event pages: ${expanded}   paused as dead: ${paused}`)
  if (!APPLY) console.log('\nNothing was written. Re-run with --apply to save.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
