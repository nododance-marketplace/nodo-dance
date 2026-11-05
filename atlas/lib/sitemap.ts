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

/**
 * Strong signals that a URL is an event or calendar listing page.
 *
 * These name what the page is, so a path containing one of them is a page
 * worth reading — a calendar, a schedule, an event. The match is loose on
 * purpose: studios write their slugs without separators ("esquinasocial",
 * "outdoormilonga", "main-events").
 */
const EVENT_URL_HINTS = [
  'event', 'calendar', 'schedule', 'milonga', 'practica',
  'workshop', 'festival', 'social', 'gatherings',
  'upcoming', 'what-s-on', 'whats-on',
]

/**
 * Weak signals. They only mean something next to a date: "class" is in
 * every dance school's sitemap, including the SEO article about choosing
 * a dance class for kids and the page describing each class.
 */
const WEAK_URL_HINTS = ['class', 'classes', 'lesson', 'lessons', 'night', 'nights', 'gather', 'flights', 'community', 'party', 'parties']

/** Paths that are never event listings. */
const NON_EVENT_PATHS = [
  '/blog', '/news', '/about', '/contact', '/privacy', '/terms', '/faq',
  '/cart', '/shop', '/product', '/login', '/wp-admin', '/feed', '/tag/',
  '/category/', '/author/', '/search', '/careers', '/press', '/media',
  '/gift', '/coupon', '/membership', '/memberships', '/staff', '/team',
]

/** A date written into a URL: 2026-11-04, 11-04-2026, 12/13/2026. */
const URL_DATE_RE =
  /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return null
  }
}

export function looksLikeEventPage(url: string): boolean {
  const pathname = pathOf(url)
  if (!pathname) return false
  if (NON_EVENT_PATHS.some(p => pathname.includes(p))) return false

  // A strong hint means the path names what the page is.
  if (EVENT_URL_HINTS.some(hint => pathname.includes(hint))) return true

  // Otherwise a weak hint has to be backed by a date in the URL.
  const weak = WEAK_URL_HINTS.some(hint => pathname.includes(hint))
  return weak && URL_DATE_RE.test(pathname)
}

/**
 * Does this URL name a date that has already passed?
 *
 * A sitemap keeps listing last year's events. Crawling them costs a fetch
 * and produces a candidate the expiry rule rejects, so they are skipped.
 */
export function isPastEventUrl(url: string, now: Date = new Date()): boolean {
  const pathname = pathOf(url)
  if (!pathname) return false
  const m = URL_DATE_RE.exec(pathname)
  if (!m) return false

  const parts = m[0].split(/[-/.]/)
  let year: number
  let month: number
  let day: number
  if (parts[0].length === 4) {
    ;[year, month, day] = parts.map(Number)
  } else {
    ;[month, day, year] = parts.map(Number)
  }
  if (!year || !month || !day) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const when = Date.UTC(year, month - 1, day)
  if (Number.isNaN(when)) return false
  // A grace period: today and yesterday may still be running.
  return when < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86400000
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
