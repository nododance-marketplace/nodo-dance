/**
 * City Discovery (Atlas Agent A).
 *
 * Discovery finds *candidate sources* — it never creates published records.
 * Two providers:
 *   - DuckDuckGo HTML (free, no key, rate-limited). Used by default.
 *   - Serper (paid Google results). Used when SERPER_API_KEY is present.
 *
 * Absence of results is never treated as evidence that a city has no dance
 * community — it is only a signal that our query set needs widening.
 */
import { Fetcher } from './fetcher'
import { domainOf } from './normalize'
import { stripHtml, tidy } from './parsers/html'

export interface DiscoveredSource {
  url: string
  title: string
  snippet?: string
  provider: string
}

export interface DiscoveryQuery {
  city: string
  state: string
  style: string
  variant?: string
}

/**
 * Build the query set for a city. Multiple phrasings per style, because
 * search phrasing strongly affects which local sites surface.
 */
export function buildQueries(city: string, state: string, styles: string[]): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = []
  const stylePhrases: Record<string, string[]> = {
    Salsa: ['salsa classes', 'salsa social', 'salsa school'],
    Bachata: ['bachata classes', 'bachata social', 'bachata school'],
    Tango: ['tango milonga', 'tango classes', 'tango practica'],
    Kizomba: ['kizomba classes', 'kizomba social'],
    Zouk: ['zouk classes', 'brazilian zouk social'],
    'West Coast Swing': ['west coast swing', 'wcs social'],
    'Carolina Shag': ['carolina shag'],
    Balboa: ['balboa classes'],
    Ballroom: ['ballroom classes', 'ballroom social'],
    Cumbia: ['cumbia classes', 'cumbia social'],
    'Country Line Dancing': ['country line dancing classes'],
  }

  for (const style of styles) {
    const phrases = stylePhrases[style] ?? [style.toLowerCase()]
    for (const phrase of phrases) {
      queries.push({ city, state, style, variant: phrase })
    }
  }

  // Generic organization queries catch schools that list several styles.
  queries.push({ city, state, style: 'General', variant: 'dance school' })
  queries.push({ city, state, style: 'General', variant: 'dance classes calendar' })
  queries.push({ city, state, style: 'General', variant: 'social dance events' })
  return queries
}

export class Discovery {
  private fetcher: Fetcher
  private serperKey?: string

  constructor(fetcher: Fetcher, serperKey = process.env.SERPER_API_KEY) {
    this.fetcher = fetcher
    this.serperKey = serperKey
  }

  async search(query: string, limit = 10): Promise<DiscoveredSource[]> {
    if (this.serperKey) return this.searchSerper(query, limit)
    return this.searchDuckDuckGo(query, limit)
  }

  private async searchSerper(query: string, limit: number): Promise<DiscoveredSource[]> {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.serperKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: limit }),
    })
    if (!res.ok) throw new Error(`Serper search failed: HTTP ${res.status}`)
    const json = (await res.json()) as any
    return (json.organic ?? []).slice(0, limit).map((r: any) => ({
      url: r.link,
      title: r.title ?? '',
      snippet: r.snippet,
      provider: 'serper',
    }))
  }

  /** DuckDuckGo's lite HTML endpoint — no API key, publicly reachable. */
  private async searchDuckDuckGo(query: string, limit: number): Promise<DiscoveredSource[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await this.fetcher.fetch(url, {
      headers: { Accept: 'text/html' },
    })
    const { text } = stripHtml(res.body)
    const out: DiscoveredSource[] = []
    const re = /https?:\/\/[^\s"'<>]+/g
    const seen = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && out.length < limit) {
      let link = m[0]
      if (link.includes('duckduckgo.com')) continue
      if (!/^https?:\/\//.test(link)) continue
      link = link.replace(/&amp;/g, '&')
      if (seen.has(link)) continue
      seen.add(link)
      out.push({ url: link, title: '', provider: 'duckduckgo' })
    }
    return out
  }
}

/**
 * Filter raw search results down to plausible dance sources.
 * Cheap, deterministic heuristics — no LLM needed for a first pass.
 */
export function looksLikeDanceSource(source: DiscoveredSource): boolean {
  const haystack = `${source.url} ${source.title ?? ''} ${source.snippet ?? ''}`.toLowerCase()
  const signals = [
    'salsa', 'bachata', 'kizomba', 'zouk', 'tango', 'milonga', 'swing',
    'shag', 'balboa', 'ballroom', 'cumbia', 'dance', 'social',
  ]
  return signals.some(s => haystack.includes(s))
}

/** Exclude aggregators and social platforms — we want organizer-owned sites. */
export function isExcludedDomain(url: string): boolean {
  const domain = domainOf(url)
  const excluded = [
    'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
    'youtube.com', 'reddit.com', 'meetup.com', 'eventbrite.com', 'yelp.com',
    'wikipedia.org', 'google.com', 'bing.com', 'duckduckgo.com', 'linkedin.com',
    'pinterest.com', 'amazon.com', 'ebay.com', 'etsy.com',
  ]
  return excluded.some(d => domain === d || domain.endsWith(`.${d}`))
}

/** Discover candidate sources for a city across all configured styles. */
export async function discoverCity(
  discovery: Discovery,
  city: string,
  state: string,
  styles: string[]
): Promise<DiscoveredSource[]> {
  const queries = buildQueries(city, state, styles)
  const results = new Map<string, DiscoveredSource>()

  for (const query of queries) {
    const text = `"${query.variant}" ${city} ${state}`
    let hits: DiscoveredSource[] = []
    try {
      hits = await discovery.search(text, 10)
    } catch (error) {
      // A failed query is a gap in coverage, not proof of absence.
      continue
    }
    for (const hit of hits) {
      if (isExcludedDomain(hit.url)) continue
      if (!looksLikeDanceSource(hit)) continue
      const key = hit.url.replace(/\/$/, '')
      if (!results.has(key)) {
        results.set(key, { ...hit, title: tidy(hit.title ?? hit.url) })
      }
    }
    // Be gentle: DuckDuckGo does not like rapid-fire queries.
    await new Promise(r => setTimeout(r, 2500))
  }

  return Array.from(results.values())
}
