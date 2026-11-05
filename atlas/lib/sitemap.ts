/**
 * Sitemap parsing for Atlas.
 *
 * This is the highest-value, zero-cost discovery mechanism: a site's own
 * sitemap enumerates its public pages, and we can find the event pages
 * without guessing URLs or touching a search engine.
 *
 * Handles both <sitemapindex> (nested) and <urlset> forms, plus <lastmod>.
 */
import { Fetcher } from './fetcher'
import { RobotsCache } from './robots'

export interface SitemapUrl {
  loc: string
  lastmod?: string
  priority?: number
}

/** Strong signals that a URL is an event/calendar listing page. */
const EVENT_URL_HINTS = [
  'event', 'calendar', 'schedule', 'class', 'social', 'milonga', 'practica',
  'practice', 'workshop', 'festival', 'party', 'lesson', 'upcoming', 'what-s-on',
  'whats-on', 'gatherings', 'community', 'flights', 'nights', 'gather',
]

/** Paths that are never event listings. */
const NON_EVENT_PATHS = [
  '/blog', '/news', '/about', '/contact', '/privacy', '/terms', '/faq',
  '/cart', '/shop', '/product', '/login', '/wp-admin', '/feed', '/tag/',
  '/category/', '/author/', '/search', '/careers', '/press', '/media',
  '/gift', '/coupon', '/membership', '/memberships', '/staff', '/team',
]

export function looksLikeEventPage(url: string): boolean {
  let pathname: string
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return false
  }
  if (NON_EVENT_PATHS.some(p => pathname.includes(p))) return false
  return EVENT_URL_HINTS.some(hint => pathname.includes(hint))
}

function parseXmlLoc(xml: string): string[] {
  const locs: string[] = []
  const re = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const value = m[1].trim()
    if (value) locs.push(value)
  }
  return locs
}

export class SitemapReader {
  constructor(
    private fetcher: Fetcher,
    private robots: RobotsCache
  ) {}

  /**
   * Fetch and parse the sitemaps for an origin.
   * Returns the URLs from the sitemap index and up to `maxSitemaps` child maps.
   */
  async read(origin: string, maxSitemaps = 5): Promise<SitemapUrl[]> {
    const results: SitemapUrl[] = []

    for (const candidate of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
      const url = `${origin}${candidate}`
      const allowed = await this.isAllowed(url)
      if (!allowed) continue

      let body: string
      try {
        const res = await this.fetcher.fetch(url)
        if (res.status !== 200) continue
        body = res.body
      } catch {
        continue
      }

      const locs = parseXmlLoc(body)
      if (locs.length === 0) continue

      // Nested sitemap index
      if (/<sitemapindex/i.test(body)) {
        for (const child of locs.slice(0, maxSitemaps)) {
          if (!(await this.isAllowed(child))) continue
          try {
            const childRes = await this.fetcher.fetch(child)
            if (childRes.status !== 200) continue
            results.push(...parseUrlSet(childRes.body))
          } catch {
            /* skip unreadable child map */
          }
        }
      } else {
        results.push(...parseUrlSet(body))
      }

      if (results.length > 0) break
    }

    return results
  }

  private async isAllowed(url: string): Promise<boolean> {
    const origin = new URL(url).origin
    const groups = await this.robots.load(
      origin,
      this.fetcher.policy.userAgent,
      async robotsUrl => {
        const res = await this.fetcher.fetch(robotsUrl)
        return { status: res.status, body: res.body }
      }
    )
    return this.robots.decide(groups, url, this.fetcher.policy.userAgent).allowed
  }
}

function parseUrlSet(xml: string): SitemapUrl[] {
  const urls: SitemapUrl[] = []
  const re = /<url>([\s\S]*?)<\/url>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const block = m[1]
    const loc = /<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/i.exec(block)?.[1]?.trim()
    if (!loc) continue
    const lastmod = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block)?.[1]?.trim()
    const priority = Number(/<priority>([\d.]+)<\/priority>/i.exec(block)?.[1] ?? '0')
    urls.push({ loc, lastmod, priority: Number.isNaN(priority) ? undefined : priority })
  }
  return urls
}
