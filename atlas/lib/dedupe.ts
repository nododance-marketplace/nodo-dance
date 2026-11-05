/**
 * Entity Resolution (Atlas Agent E).
 *
 * Order of attack:
 *   1. Exact canonical URL match.
 *   2. Exact normalized (title + local date) match.
 *   3. Venue + time match (same address, same start).
 *   4. Fuzzy title match with date proximity.
 *
 * Deterministic rules decide; probabilistic rules only ever *propose* a match
 * that a human confirms. Organizer-created records always win a tie.
 */
import { jaroWinkler, normalizeAddress, normalizeTitle } from './normalize'
import type { ExtractedEvent } from './types'

export type MatchType = 'EXACT' | 'NORMALIZED' | 'FUZZY_TITLE' | 'VENUE_TIME' | 'SERIES'

export interface ExistingRecord {
  id: string
  title: string
  sourceUrl?: string | null
  localDate?: string | null
  localTime?: string | null
  address?: string | null
  venueName?: string | null
  city?: string | null
  state?: string | null
  organizerName?: string | null
  /** True when the record was created by an organizer (authoritative). */
  isOrganizerOwned?: boolean
  publishedVia?: string | null
  recurrenceGroupId?: string | null
  isRecurring?: boolean
}

export interface ProposedMatch {
  existingId: string
  matchType: MatchType
  score: number
  reason: string
  /** True when the match is certain enough to auto-suppress the candidate. */
  deterministic: boolean
}

export interface MatchOptions {
  /** Titles closer than this many days count as "the same occurrence". */
  dateWindowDays?: number
  /** Fuzzy title similarity required to propose a match. */
  fuzzyThreshold?: number
}

const DEFAULT_OPTIONS: Required<MatchOptions> = {
  dateWindowDays: 3,
  fuzzyThreshold: 0.9,
}

function daysBetween(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b) return null
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(ta - tb) / 86400000
}

export function proposeMatches(
  candidate: ExtractedEvent,
  existing: ExistingRecord[],
  options: MatchOptions = {}
): ProposedMatch[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const matches: ProposedMatch[] = []

  const candUrl = canonicalUrl(candidate.sourceUrlCanonical ?? candidate.sourceUrl)
  const candTitle = normalizeTitle(candidate.title)
  const candAddress = normalizeAddress(candidate.address)

  for (const record of existing) {
    const recUrl = record.sourceUrl ? canonicalUrl(record.sourceUrl) : ''
    const dateDist = daysBetween(candidate.localDate, record.localDate ?? undefined)
    const sameDay = dateDist !== null && dateDist <= opts.dateWindowDays

    // 1 — exact canonical URL on the same date → same occurrence
    if (recUrl && recUrl === candUrl) {
      if (sameDay) {
        matches.push({
          existingId: record.id,
          matchType: 'EXACT',
          score: 1,
          reason: `Same canonical source URL and date (${candUrl})`,
          deterministic: true,
        })
      } else {
        // Same page, different date: a recurring series, not a duplicate.
        matches.push({
          existingId: record.id,
          matchType: 'SERIES',
          score: 0.6,
          reason: `Same source page, different date (${dateDist} days apart) — likely the same series`,
          deterministic: false,
        })
      }
      continue
    }

    const recTitle = normalizeTitle(record.title ?? undefined)
    const titleExact = candTitle.length > 2 && recTitle === candTitle

    // 2 — exact normalized title + date proximity
    if (titleExact && sameDay) {
      // Same title and date, but both sides name a *different* venue: this is
      // a proposal for a human, not a certain duplicate.
      const candVenue = normalizeAddress(candidate.address) || normalizeTitle(candidate.venueName ?? '')
      const recVenue = normalizeAddress(record.address) || normalizeTitle(record.venueName ?? '')
      const venuesConflict = Boolean(candVenue && recVenue && candVenue !== recVenue)
      matches.push({
        existingId: record.id,
        matchType: 'NORMALIZED',
        score: venuesConflict ? 0.8 : 0.97,
        reason: venuesConflict
          ? `Same normalized title and date, but different venues ("${record.venueName ?? record.address}") — needs review`
          : `Same normalized title "${candTitle}" within ${dateDist} day(s)`,
        deterministic: !venuesConflict,
      })
      continue
    }

    // 2b — same title on the same weekday: same series, different occurrence
    if (titleExact && dateDist !== null && dateDist > opts.dateWindowDays && dateDist % 7 === 0) {
      matches.push({
        existingId: record.id,
        matchType: 'SERIES',
        score: 0.7,
        reason: `Same title recurring weekly — same series, occurrence ${dateDist / 7} apart`,
        deterministic: false,
      })
      continue
    }

    // 3 — same venue address on the SAME day and time
    const recAddress = normalizeAddress(record.address)
    if (candAddress && recAddress && candAddress === recAddress && dateDist === 0) {
      const sameTime =
        candidate.localTime && record.localTime
          ? candidate.localTime === record.localTime
          : true
      if (sameTime) {
        matches.push({
          existingId: record.id,
          matchType: 'VENUE_TIME',
          score: 0.92,
          reason: `Same venue address, date and time (${record.localTime ?? 'time not stated'})`,
          deterministic: true,
        })
        continue
      }
    }

    // 4 — fuzzy title within a tight window (proposal only)
    if (candTitle.length > 4 && recTitle.length > 4) {
      const similarity = jaroWinkler(candTitle, recTitle)
      if (similarity >= opts.fuzzyThreshold && sameDay) {
        matches.push({
          existingId: record.id,
          matchType: 'FUZZY_TITLE',
          score: Number(similarity.toFixed(3)),
          reason: `Title similarity ${similarity.toFixed(2)} within ${dateDist} day(s)`,
          deterministic: false,
        })
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score)
}

/**
 * Canonical URL form used for exact-match dedupe:
 * lowercased host, no www, no trailing slash, no tracking params, no fragment.
 */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']
    for (const key of drop) u.searchParams.delete(key)
    let out = `${u.protocol}//${u.hostname}${u.pathname}${u.search}`
    out = out.replace(/\/+$/, '')
    return out
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Stable dedupe key for a candidate. Used to make ingestion idempotent:
 * re-running the same crawl must not create a second candidate.
 */
export function dedupeKey(candidate: ExtractedEvent): string {
  const title = normalizeTitle(candidate.title)
  const date = candidate.localDate ?? ''
  const time = candidate.localTime ?? ''
  const venue = normalizeAddress(candidate.address) || normalizeTitle(candidate.venueName ?? '')
  return `${title}|${date}|${time}|${venue}`
}

/** Series key for recurring candidates — same recurrence + same venue = one series. */
export function seriesKey(candidate: ExtractedEvent): string | null {
  if (!candidate.isRecurring || !candidate.recurrenceRule) return null
  const rrule = candidate.recurrenceRule.rrule.replace(/UNTIL=[0-9]+;?/, '').replace(/COUNT=\d+;?/, '')
  const venue = normalizeAddress(candidate.address) || normalizeTitle(candidate.venueName ?? '')
  return `${rrule}|${venue}`
}
