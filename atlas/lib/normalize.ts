/**
 * Normalization helpers for Atlas.
 *
 * Everything scraped is untrusted free text. These functions map it onto the
 * canonical Nodo vocabularies (DANCE_STYLES / EVENT_TYPES) without inventing
 * data: when nothing matches we return null/Other rather than guessing.
 */
import type { DanceStyle, NodoEventType } from './types'
import { CANONICAL_DANCE_STYLES, CANONICAL_EVENT_TYPES } from './types'

export const DANCE_STYLES = CANONICAL_DANCE_STYLES
export const EVENT_TYPES = CANONICAL_EVENT_TYPES

/** Ordered longest-first so "West Coast Swing" wins over "Swing". */
const STYLE_PATTERNS: Array<{ style: DanceStyle; patterns: RegExp[] }> = [
  { style: 'West Coast Swing', patterns: [/\bwest\s*coast\s*swing\b/i, /\bwcs\b/i] },
  { style: 'Country Line Dancing', patterns: [/\bcountry\s*line\s*danc/i, /\bline\s*danc/i] },
  { style: 'Carolina Shag', patterns: [/\bcarolina\s*shag\b/i, /\bshag\b/i] },
  { style: 'Tango', patterns: [/\btango\b/i, /\bmilonga\b/i, /\bpr[áa]ctica\b/i] },
  { style: 'Kizomba', patterns: [/\bkizomba\b/i, /\bsemba\b/i] },
  { style: 'Zouk', patterns: [/\b(brazilian\s*)?zouk\b/i, /\bbr[óo]zouk\b/i] },
  { style: 'Balboa', patterns: [/\bbalboa\b/i] },
  { style: 'Salsa', patterns: [/\bsalsa\b/i] },
  { style: 'Bachata', patterns: [/\bbachata\b/i] },
  { style: 'Cumbia', patterns: [/\bcumbia\b/i] },
  { style: 'Ballroom', patterns: [/\bballroom\b/i, /\bswing\s*danc/i] },
]

/**
 * Detect dance styles mentioned in free text.
 * Returns [] when nothing matches — callers decide how to handle that.
 */
export function detectStyles(text: string): DanceStyle[] {
  if (!text) return []
  const found = new Set<DanceStyle>()
  for (const { style, patterns } of STYLE_PATTERNS) {
    if (patterns.some(p => p.test(text))) found.add(style)
  }
  return Array.from(found)
}

/**
 * Map free text to a Nodo event type.
 * Returns null when ambiguous — we never guess a type we cannot justify.
 */
export function detectEventType(text: string): NodoEventType | null {
  if (!text) return null
  const t = text.toLowerCase()

  if (/\b(milonga|practica|pr[áa]ctica)\b/.test(t)) return 'TANGO_MILONGA'
  if (/\b(festival|fest\b|congress|convention|marathon|weekend fest)/.test(t)) return 'FESTIVAL'
  if (/\b(workshop|bootcamp|seminar|master ?class|intensive)\b/.test(t)) return 'WORKSHOP'
  if (/\b(class|classes|group lesson|group class|lesson|levels|beginner|intermediate|advanced)\b/.test(t)) {
    return 'GROUP_CLASS'
  }
  if (/\b(social|socials|party|practica night|dance party|night out|bashment)\b/.test(t)) return 'SOCIAL'
  return null
}

/**
 * Parse a price string into an integer amount (whole dollars).
 * Returns null for free / unknown / non-monetary values.
 */
export function parsePrice(text: string | undefined | null): { price?: number; priceText?: string } {
  if (!text) return {}
  const raw = text.trim()
  if (!raw) return {}

  if (/\bfree\b/i.test(raw) && !/\$\s*\d/.test(raw)) return { price: undefined, priceText: raw }

  const dollar = raw.match(/\$\s*([\d,]+(?:\.\d{2})?)/)
  if (dollar) {
    const n = Number(dollar[1].replace(/,/g, ''))
    if (!Number.isNaN(n)) {
      return { price: Math.round(n), priceText: raw }
    }
  }

  // "$15-$20" ranges → take the lower bound but keep the original text.
  const range = raw.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i)
  if (range && /\$\s*\d/.test(raw)) {
    return { price: Number(range[1]), priceText: raw }
  }

  return { price: undefined, priceText: raw }
}

/**
 * Normalize an address for dedupe matching:
 * lowercase, strip punctuation, collapse whitespace, drop unit designators.
 */
export function normalizeAddress(address: string | undefined | null): string {
  if (!address) return ''
  return address
    .toLowerCase()
    .replace(/[,\s]+(?:suite|ste|apt|apartment|unit|#|bldg|building|floor|fl|room|rm)\.?\s*[a-z0-9-]*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize a title for dedupe: lowercase, strip punctuation and filler words. */
export function normalizeTitle(title: string | undefined | null): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/\b(am|pm|tickets?|free|admission|event|social|practice|practica|class)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize a domain for grouping sources. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/** Stable hash used for dedupe keys and content fingerprints. */
export function stableHash(input: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (
    (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(10, '0') +
    (4294967296 * (2097151 & h1) + (h2 >>> 0)).toString(36).padStart(10, '0')
  )
}

/** Jaro-Winkler similarity — used for fuzzy title matching. */
export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aFlags = new Array(a.length).fill(false)
  const bFlags = new Array(b.length).fill(false)
  let matches = 0

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bFlags[j]) continue
      if (a[i] !== b[j]) continue
      aFlags[i] = true
      bFlags[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue
    while (!bFlags[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions = Math.floor(transpositions / 2)

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3

  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}
