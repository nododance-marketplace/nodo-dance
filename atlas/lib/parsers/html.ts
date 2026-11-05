/**
 * HTML utilities for Atlas — dependency-free.
 *
 * The pipeline deliberately avoids a heavy DOM library: the pages we care
 * about are mostly server-rendered, and a targeted scanner is faster, smaller
 * and easier to test than a general DOM implementation.
 */
import { createHash } from 'node:crypto'

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—',
  ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä',
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

export interface StrippedHtml {
  text: string
  /** offsets[i] = index in the original html where text[i] came from. */
  offsets: number[]
}

/** Remove script/style content and tags, keeping a map back to source offsets. */
export function stripHtml(html: string): StrippedHtml {
  const out: string[] = []
  const offsets: number[] = []
  let i = 0
  let skipUntil = -1

  while (i < html.length) {
    if (skipUntil > 0 && i < skipUntil) {
      i = skipUntil
      skipUntil = -1
      continue
    }
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      pushText(out, offsets, html.slice(i), i)
      break
    }
    if (lt > i) pushText(out, offsets, html.slice(i, lt), i)

    // Comments and doctypes carry no content — skip them entirely.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt)
      i = end === -1 ? html.length : end + 3
      continue
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt)
      i = end === -1 ? html.length : end + 1
      continue
    }

    const tagMatch = /^<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt))
    if (!tagMatch) {
      pushText(out, offsets, '<', lt)
      i = lt + 1
      continue
    }
    const tagName = tagMatch[2].toLowerCase()
    const gt = findTagEnd(html, lt)
    i = gt + 1

    if (!tagMatch[1] && (tagName === 'script' || tagName === 'style' || tagName === 'noscript')) {
      const closeIdx = html.toLowerCase().indexOf(`</${tagName}`, i)
      skipUntil = closeIdx === -1 ? html.length : closeIdx
      continue
    }
    if (!tagMatch[1] && (tagName === 'br' || tagName === 'p' || tagName === 'div' || tagName === 'li' || tagName === 'tr')) {
      pushText(out, offsets, ' ', lt)
    }
  }

  const text = decodeEntities(out.join('')).replace(/\s+/g, ' ')
  // Rebuild offsets after whitespace collapsing is approximate — good enough
  // for locating a date occurrence back into the source HTML.
  return { text, offsets }
}

function pushText(out: string[], offsets: number[], chunk: string, startOffset: number): void {
  for (let k = 0; k < chunk.length; k++) {
    out.push(chunk[k])
    offsets.push(startOffset + k)
  }
}

function findTagEnd(html: string, start: number): number {
  let inQuote: string | null = null
  for (let i = start; i < html.length; i++) {
    const ch = html[i]
    if (inQuote) {
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") inQuote = ch
    else if (ch === '>') return i
  }
  return html.length - 1
}

/** Extract JSON-LD blocks (schema.org). */
export function extractJsonLd(html: string): any[] {
  const blocks: any[] = []
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const raw = m[1].trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) blocks.push(...parsed)
      else blocks.push(parsed)
    } catch {
      // Some sites emit trailing commas or comments — try a lenient repair.
      try {
        const repaired = raw.replace(/,\s*([}\]])/g, '$1').replace(/\/\*[\s\S]*?\*\//g, '')
        const parsed = JSON.parse(repaired)
        if (Array.isArray(parsed)) blocks.push(...parsed)
        else blocks.push(parsed)
      } catch {
        /* unparseable JSON-LD — ignore this block */
      }
    }
  }
  return blocks
}

/** Extract OpenGraph and common meta tags. */
export function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {}
  const re = /<meta\s+([^>]*?)\/?>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const attrs = m[1]
    const key =
      /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ??
      /(?:property|name|itemprop)\s*=\s*([^\s"'>]+)/i.exec(attrs)?.[1]
    if (!key) continue
    const content =
      /content\s*=\s*["']([\s\S]*?)["']/i.exec(attrs)?.[1] ??
      /content\s*=\s*([^\s"'>]+)/i.exec(attrs)?.[1]
    if (content) meta[key.toLowerCase()] = decodeEntities(content).trim()
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  if (title) meta['title'] = decodeEntities(title).trim()
  return meta
}

export interface PageLink {
  href: string
  text: string
  position: number
}

/** Extract links with their text and source position. */
export function extractLinks(html: string): PageLink[] {
  const links: PageLink[] = []
  const re = /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[2]).trim()
    const inner = m[4]
    const text = decodeEntities(inner.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    links.push({ href, text, position: m.index })
  }
  return links
}

/** Find the start tag that begins the element containing a given html offset. */
export function findEnclosingTag(html: string, offset: number): { tag: string; attrs: string } | null {
  const prefix = html.slice(0, offset)
  const openTags: Array<{ tag: string; attrs: string; pos: number }> = []
  const re = /<\s*(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(prefix))) {
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (closing) {
      for (let i = openTags.length - 1; i >= 0; i--) {
        if (openTags[i].tag === tag) {
          openTags.length = i
          break
        }
      }
    } else if (!m[0].endsWith('/>') && !['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag)) {
      openTags.push({ tag, attrs: m[3] ?? '', pos: m.index })
    }
  }
  const innermost = openTags[openTags.length - 1]
  if (!innermost) return null
  return { tag: innermost.tag, attrs: innermost.attrs }
}

/** Link labels that are never useful as an event title. */
const GENERIC_TITLES = [
  'view event', 'view events', 'event', 'events', 'details', 'detail', 'more info',
  'more information', 'learn more', 'read more', 'register', 'registration',
  'sign up', 'signup', 'rsvp', 'rsvp now', 'click here', 'join now', 'buy tickets',
  'tickets', 'get tickets', 'book now', 'book', 'reserve', 'save the date',
  'view event →', 'view event ->', 'learn more →', 'learn more ->',
]

/** True when a string is a generic call-to-action rather than a name. */
export function isGenericTitle(text: string): boolean {
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!t) return true
  return GENERIC_TITLES.some(g => t === g || t.startsWith(`${g} `))
}

/** Strip a leading clock time from a title ("8:15 pm Afro-Cuban" → "Afro-Cuban"). */
export function stripLeadingTime(text: string): string {
  return text
    .replace(/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–—]?\s*/i, '')
    .trim()
}

/** Find the nearest heading before a given html offset. */
export function findNearestHeading(html: string, offset: number): string | null {
  const prefix = html.slice(0, offset)
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi
  let m: RegExpExecArray | null
  let last: string | null = null
  while ((m = re.exec(prefix))) {
    const text = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (text.length >= 3 && text.length <= 140) last = text
  }
  return last
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Collapse whitespace and trim. */
export function tidy(input: string): string {
  return decodeEntities(input).replace(/\s+/g, ' ').trim()
}
