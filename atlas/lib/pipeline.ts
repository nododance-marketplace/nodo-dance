/**
 * Atlas pipeline orchestration.
 *
 * Flow per source:
 *   robots gate → conditional fetch → change detection → extraction ladder
 *   → normalisation → recurrence → QA → dedupe → candidate storage
 *
 * Idempotency: candidates are keyed by dedupeKey + sourceId. Re-running the
 * same crawl updates the existing candidate instead of creating a duplicate.
 */
import { PrismaClient } from '../generated/local-client'
import { Fetcher } from './fetcher'
import { RobotsCache } from './robots'
import { domainOf, stableHash } from './normalize'
import { extractEvents, extractSchool } from './parsers/extract'
import { isGenericTitle, stripHtml } from './parsers/html'
import { LlmExtractor } from './llm'
import { looksLikeEventListing } from './llm-gate'
import { canonicalUrl, dedupeKey, proposeMatches, seriesKey, type ExistingRecord } from './dedupe'
import { isCancellationNotice, validateEvent } from './qa'
import { detectRecurrence, dayOfWeek } from './recurrence'
import { findRecurrencePhrase } from './parsers/dates'
import type { ExtractedEvent, FetchResult } from './types'

export interface AtlasOptions {
  prisma: PrismaClient
  fetcher?: Fetcher
  robots?: RobotsCache
  defaultTimeZone?: string
  /** When true nothing is written; used by --dry-run. */
  dryRun?: boolean
  /** Optional LLM sidecar for the long tail. */
  llm?: LlmExtractor
}

export interface CrawlOutcome {
  sourceId: string
  url: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_BLOCKED' | 'SKIPPED_UNCHANGED' | 'DRY_RUN'
  httpStatus?: number
  durationMs: number
  bytes: number
  candidatesFound: number
  candidatesAccepted: number
  candidatesRejected: number
  quarantine: number
  duplicates: number
  extractionMethod?: string
  contentChanged: boolean
  error?: string
  costUsd: number
}

/**
 * Make a string safe to store.
 *
 * Measured against PostgreSQL 16 and the Prisma query engine, exactly two
 * classes of character make a write fail:
 *
 *   • A NUL byte — Postgres rejects the whole statement with
 *     "invalid byte sequence for encoding UTF8: 0x00" (SQLSTATE 22021).
 *   • A lone surrogate — the Prisma engine serialises parameters as JSON and
 *     fails with "unexpected end of hex escape" before the query is sent.
 *
 * Everything else is accepted by the database and is deliberately left alone:
 * an invalid \u escape, a trailing lone backslash, BEL, CR and ESC all store
 * without complaint. Escaping them would only corrupt the text.
 *
 * One bad page must never stop a crawl, so every string is cleaned before it
 * is written.
 */
export function sanitizeForDb(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value
  return value
    // Control characters, except tab, newline and carriage return.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Lone surrogates become the replacement character. A well-formed pair —
    // an emoji, an accented character — is left untouched.
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
    // A trailing lone backslash makes a URL a different URL, which splits
    // dedupe keys and creates duplicate candidates.
    .replace(/\\+$/, '')
}

export class Atlas {
  private prisma: PrismaClient
  private fetcher: Fetcher
  private robots: RobotsCache
  private defaultTimeZone: string
  private dryRun: boolean
  private llm: LlmExtractor

  constructor(opts: AtlasOptions) {
    this.prisma = opts.prisma
    this.fetcher = opts.fetcher ?? new Fetcher()
    this.robots = opts.robots ?? new RobotsCache()
    this.defaultTimeZone = opts.defaultTimeZone ?? 'America/New_York'
    this.dryRun = opts.dryRun ?? false
    this.llm = opts.llm ?? new LlmExtractor()
  }

  /** Register a source, skipping duplicates by canonical URL. */
  async registerSource(input: {
    url: string
    organizationName?: string
    cityId?: string
    sourceCategory?: string
    sourceType?: string
    supportedStyles?: string[]
    timeZone?: string
    discoveredVia?: string
    notes?: string
  }) {
    const canonical = canonicalUrl(input.url)
    const existing = await this.prisma.discoverySource.findFirst({ where: { url: canonical } })
    if (existing) return { source: existing, created: false }

    if (this.dryRun) {
      return {
        source: { id: 'dry-run', url: canonical } as never,
        created: true,
      }
    }

    const source = await this.prisma.discoverySource.create({
      data: {
        url: canonical,
        domain: domainOf(canonical),
        organizationName: sanitizeForDb(input.organizationName),
        cityId: input.cityId,
        sourceCategory: input.sourceCategory ?? 'EVENT_ORG',
        sourceType: input.sourceType ?? 'HTML',
        supportedStyles: JSON.stringify(input.supportedStyles ?? []),
        discoveredVia: input.discoveredVia ?? 'MANUAL',
        notes: sanitizeForDb(input.notes),
        nextCrawlAt: new Date(),
      },
    })
    return { source, created: true }
  }

  /** Crawl one source and persist resulting candidates. */
  async crawlSource(sourceId: string, urlOverride?: string): Promise<CrawlOutcome> {
    const source = await this.prisma.discoverySource.findUnique({
      where: { id: sourceId },
      include: { city: true },
    })
    if (!source) throw new Error(`Unknown source ${sourceId}`)

    const started = Date.now()
    const targetUrl = urlOverride ?? source.url
    const origin = new URL(targetUrl).origin

    // 1 — robots gate
    const groups = await this.robots.load(
      origin,
      this.fetcher.policy.userAgent,
      async robotsUrl => {
        const res = await this.fetcher.fetch(robotsUrl)
        return { status: res.status, body: res.body }
      }
    )
    const decision = this.robots.decide(groups, targetUrl, this.fetcher.policy.userAgent)

    // Honour a robots.txt Crawl-delay for this domain.
    if (decision.crawlDelayMs) {
      this.fetcher.setDomainDelay(new URL(targetUrl).hostname, decision.crawlDelayMs)
    }

    const desiredRobotsStatus = decision.allowed ? 'ALLOWED' : 'DISALLOWED'
    if (!this.dryRun && source.robotsStatus !== desiredRobotsStatus) {
      await this.prisma.discoverySource.update({
        where: { id: sourceId },
        data: {
          robotsStatus: desiredRobotsStatus,
          robotsCheckedAt: new Date(),
          robotsDetail: sanitizeForDb(decision.reason),
        },
      })
    }

    if (!decision.allowed) {
      await this.recordAttempt(sourceId, {
        status: 'SKIPPED_BLOCKED',
        url: targetUrl,
        errorCode: 'ROBOTS_DISALLOWED',
        errorMessage: decision.reason,
        durationMs: Date.now() - started,
      })
      return {
        sourceId, url: targetUrl, status: 'SKIPPED_BLOCKED', durationMs: Date.now() - started,
        bytes: 0, candidatesFound: 0, candidatesAccepted: 0, candidatesRejected: 0,
        quarantine: 0, duplicates: 0, contentChanged: false,
        error: decision.reason, costUsd: 0,
      }
    }

    // 2 — conditional fetch
    let result: FetchResult
    try {
      result = await this.fetcher.fetch(targetUrl, {
        etag: source.etag ?? undefined,
        lastModified: source.lastModified ?? undefined,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.recordAttempt(sourceId, {
        status: 'FAILED',
        url: targetUrl,
        errorCode: 'FETCH_FAILED',
        errorMessage: message,
        durationMs: Date.now() - started,
      })
      await this.prisma.discoverySource.update({
        where: { id: sourceId },
        data: {
          lastCrawledAt: new Date(),
          consecutiveFailures: { increment: 1 },
          nextCrawlAt: new Date(Date.now() + backoffMs(source.consecutiveFailures + 1)),
        },
      })
      return {
        sourceId, url: targetUrl, status: 'FAILED', durationMs: Date.now() - started,
        bytes: 0, candidatesFound: 0, candidatesAccepted: 0, candidatesRejected: 0,
        quarantine: 0, duplicates: 0, contentChanged: false, error: message, costUsd: 0,
      }
    }

    // 3 — change detection
    const contentChanged = result.contentHash !== source.contentHash
    if (!contentChanged && result.notModified) {
      await this.recordAttempt(sourceId, {
        status: 'SKIPPED_UNCHANGED',
        url: targetUrl,
        httpStatus: result.status,
        durationMs: result.durationMs,
        bytes: result.bytes,
        contentHash: result.contentHash,
      })
      await this.prisma.discoverySource.update({
        where: { id: sourceId },
        data: {
          lastCrawledAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFailures: 0,
          nextCrawlAt: new Date(Date.now() + source.crawlIntervalDays * 86400000),
        },
      })
      return {
        sourceId, url: targetUrl, status: 'SKIPPED_UNCHANGED', httpStatus: result.status,
        durationMs: result.durationMs, bytes: result.bytes, candidatesFound: 0,
        candidatesAccepted: 0, candidatesRejected: 0, quarantine: 0, duplicates: 0,
        contentChanged: false, costUsd: 0,
      }
    }

    // 4 — extraction ladder
    const timeZone = source.city?.timeZone ?? this.defaultTimeZone
    let events = extractEvents(result.body, result.finalUrl, timeZone)
    const school = extractSchool(result.body, result.finalUrl, timeZone)
    let method = events[0]?.extractionMethod
    let costUsd = 0

    // 4b — resolve listings whose title is a call-to-action ("View Event →")
    // by reading the page they link to. Calendar indexes link to detail pages
    // that carry the real title, date and venue.
    events = await this.resolveGenericTitles(events, timeZone)

    // 4c — page-level recurrence inference. A schedule page usually states its
    // cadence once ("Weekly group classes on Wednesday evenings") and then lists
    // the occurrences. A candidate whose date falls on the stated weekday, in a
    // group of two or more such candidates, is part of that series.
    events = this.attachPageRecurrence(events, result.body, timeZone)

    // 4d — LLM long tail. Only reached when the deterministic ladder found
    // nothing usable on a page that looks like it lists events. The sidecar is
    // optional; without it this step is skipped entirely.
    if (events.length === 0 && this.llm.enabled && looksLikeEventListing(result.body, result.finalUrl)) {
      const outcome = await this.extractWithLlm(result.finalUrl, timeZone)
      if (outcome) {
        events = [outcome.event]
        method = 'LLM'
        costUsd += outcome.costUsd
      }
    }

    // 5 — store raw extraction for auditability
    if (!this.dryRun) {
      await this.prisma.rawExtraction.create({
        data: {
          sourceId,
          url: sanitizeForDb(result.finalUrl) ?? '',
          contentHash: result.contentHash,
          rawPayload: JSON.stringify({ events, school }).slice(0, 200000),
          extractedFields: JSON.stringify(Array.from(new Set(events.flatMap(e => e.foundFields)))),
          extractor: events[0]?.extractionMethod ?? 'HTML',
          confidence: events[0] ? 0.8 : 0.4,
        },
      })
    }

    // 6 — QA + dedupe + persist candidates
    let accepted = 0
    let rejected = 0
    let quarantine = 0
    let duplicates = 0
    const seenCandidateIds: string[] = []

    for (const event of events) {
      // Cancellation is judged on the event's own text, not the whole page -
      // a school page mentioning "cancelled classes" in another section must
      // not invalidate every listing on that page.
      const cancellationScope = `${event.title} ${event.description ?? ''}`
      const qa = validateEvent(event, {
        now: new Date(),
        permissionsStatus: source.permissionsStatus,
        robotsAllowed: true,
        sourceCity: source.city?.name,
        sourceState: source.city?.state,
        pageText: result.body,
        explicitlyCancelled: isCancellationNotice(cancellationScope),
      })

      // Load comparison records per candidate: the date window differs per
      // candidate, and the query is indexed on localDate.
      const existing = await this.loadExistingRecords(event)
      const matches = proposeMatches(event, existing)

      if (!this.dryRun) {
        const candidateId = await this.persistCandidate(sourceId, event, qa.status, qa.confidence, qa.reasons, matches)
        seenCandidateIds.push(candidateId)
      }

      if (qa.status === 'REJECT') rejected++
      else if (qa.status === 'QUARANTINE') quarantine++
      else {
        accepted++
        if (matches.some(m => m.deterministic)) duplicates++
      }
    }

    // 6b — expire what this crawl did not see.
    //
    // A page changes: an event is renamed, moved or withdrawn. When the
    // extraction changes too, the old candidate keeps its own dedupe key and
    // never matches again, so the review queue fills with records of
    // things that no longer exist. Anything still awaiting a decision that
    // this crawl did not see has been superseded.
    if (!this.dryRun && seenCandidateIds.length > 0) {
      const expired = await this.prisma.candidateEvent.updateMany({
        where: {
          sourceId,
          reviewStatus: 'PENDING',
          isExpired: false,
          id: { notIn: seenCandidateIds },
        },
        data: { isExpired: true },
      })
      if (expired.count > 0) {
        console.log(`[atlas] ${expired.count} superseded candidate(s) expired for ${source.domain}`)
      }
    }

    if (school && !this.dryRun) {
      await this.persistSchool(sourceId, school)
    }

    // 7 — source health
    if (!this.dryRun) {
      await this.prisma.discoverySource.update({
        where: { id: sourceId },
        data: {
          lastCrawledAt: new Date(),
          lastSuccessAt: new Date(),
          consecutiveFailures: 0,
          contentHash: result.contentHash,
          etag: result.etag ?? null,
          lastModified: result.lastModified ?? null,
          robotsStatus: 'ALLOWED',
          nextCrawlAt: new Date(Date.now() + source.crawlIntervalDays * 86400000),
          extractionSuccessRate: { set: Math.min(1, events.length > 0 ? 0.8 : 0.2) },
        },
      })
    }

    await this.recordAttempt(sourceId, {
      status: 'SUCCESS',
      url: targetUrl,
      httpStatus: result.status,
      durationMs: result.durationMs,
      bytes: result.bytes,
      contentHash: result.contentHash,
      extractionMethod: method,
      candidatesFound: events.length,
      candidatesAccepted: accepted,
    })

    return {
      sourceId, url: targetUrl, status: 'SUCCESS', httpStatus: result.status,
      durationMs: result.durationMs, bytes: result.bytes,
      candidatesFound: events.length, candidatesAccepted: accepted,
      candidatesRejected: rejected, quarantine, duplicates,
      contentChanged: true, extractionMethod: method, costUsd: 0,
    }
  }

  /**
   * Replace generic-title candidates with the real record from the page they
   * link to. Bounded per run: each resolved URL is fetched once.
   */
  /**
   * Ask the LLM sidecar for an event record. Returns null when the sidecar is
   * unavailable or produced nothing usable — the pipeline then simply has no
   * candidate for that page, which is the correct outcome.
   */
  private async extractWithLlm(
    url: string,
    timeZone: string
  ): Promise<{ event: ExtractedEvent; costUsd: number } | null> {
    const result = await this.llm.extract(url, timeZone)
    if (!result.ok || !result.data) return null
    const event = this.llm.toCandidate(result, url, timeZone)
    if (!event) return null
    return { event, costUsd: result.costUsd ?? 0 }
  }

  private async resolveGenericTitles(
    events: ExtractedEvent[],
    timeZone: string
  ): Promise<ExtractedEvent[]> {
    const resolvedUrls = new Set<string>()
    const out: ExtractedEvent[] = []

    for (const event of events) {
      const generic = isGenericTitle(event.title)
      const target = event.sourceUrl
      if (!generic || !target || resolvedUrls.has(target)) {
        out.push(event)
        continue
      }

      // Only follow links we were allowed to see on the page we already read.
      const decision = await this.isAllowed(target)
      if (!decision) {
        out.push(event)
        continue
      }

      resolvedUrls.add(target)
      try {
        const res = await this.fetcher.fetch(target)
        if (res.status !== 200) {
          out.push(event)
          continue
        }
        const candidates = extractEvents(res.body, res.finalUrl, timeZone)
        const better = candidates.find(c => !isGenericTitle(c.title) && c.localDate)
        if (better) {
          out.push({
            ...better,
            // Keep the calendar page as the discovery URL, the detail page as canonical.
            sourceUrl: sanitizeForDb(event.sourceUrl) ?? '',
            sourceUrlCanonical: better.sourceUrlCanonical ?? res.finalUrl,
            registrationUrl: better.registrationUrl ?? event.registrationUrl,
          })
          continue
        }
        out.push(event)
      } catch {
        out.push(event)
      }
    }

    return out
  }

  private async isAllowed(url: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin
      const groups = await this.robots.load(origin, this.fetcher.policy.userAgent, async robotsUrl => {
        const res = await this.fetcher.fetch(robotsUrl)
        return { status: res.status, body: res.body }
      })
      return this.robots.decide(groups, url, this.fetcher.policy.userAgent).allowed
    } catch {
      return false
    }
  }

  /**
   * Attach a page-level recurrence rule to the candidates it governs.
   *
   * Only applied when at least two candidates on the page share the weekday the
   * rule names — one occurrence on a matching weekday is a coincidence, a
   * handful is a series.
   */
  private attachPageRecurrence(
    events: ExtractedEvent[],
    html: string,
    timeZone: string
  ): ExtractedEvent[] {
    const pageText = stripHtml(html).text
    const phrase = findRecurrencePhrase(pageText.slice(0, 20000))
    if (!phrase) return events

    const pageRule = detectRecurrence(phrase, undefined, timeZone)
    if (!pageRule.isRecurring || !pageRule.rule || pageRule.rule.byDay.length === 0) return events

    const weekdayCounts = new Map<number, number>()
    for (const event of events) {
      if (!event.localDate || event.isRecurring) continue
      const wd = dayOfWeek(event.localDate)
      weekdayCounts.set(wd, (weekdayCounts.get(wd) ?? 0) + 1)
    }

    const out: ExtractedEvent[] = []
    for (const event of events) {
      if (event.isRecurring || !event.localDate) {
        out.push(event)
        continue
      }
      const wd = dayOfWeek(event.localDate)
      const confirmed = weekdayCounts.get(wd) ?? 0
      if (!pageRule.rule.byDay.includes(wd) || confirmed < 2) {
        out.push(event)
        continue
      }
      // Anchor the rule on this occurrence so UNTIL is relative to it.
      const anchored = detectRecurrence(phrase, event.localDate, timeZone)
      if (!anchored.isRecurring || !anchored.rule) {
        out.push(event)
        continue
      }
      out.push({
        ...event,
        isRecurring: true,
        recurrenceText: phrase,
        recurrenceRule: anchored.rule,
        // Page-level inference is weaker than an explicit phrase on the event.
        recurrenceConfidence: Math.min(anchored.confidence, 0.75),
        foundFields: event.foundFields.includes('recurrence')
          ? event.foundFields
          : [...event.foundFields, 'recurrence'],
      })
    }
    return out
  }

  private async persistCandidate(
    sourceId: string,
    event: ExtractedEvent,
    qaStatus: string,
    confidence: number,
    reasons: string[],
    matches: Array<{ existingId: string; matchType: string; score: number; reason: string; deterministic: boolean }>
  ): Promise<string> {
    const key = dedupeKey(event)
    const startDateTime = event.localDate && event.localTime
      ? await this.toUtc(event.localDate, event.localTime, event.timeZone ?? this.defaultTimeZone)
      : null

    const data = {
      sourceId,
      title: sanitizeForDb(event.title) ?? '',
      description: sanitizeForDb(event.description) ?? null,
      eventType: event.eventType ?? null,
      styles: JSON.stringify(event.styles),
      otherStyle: event.otherStyle ?? null,
      startDateTime,
      endDateTime: event.localEndTime && event.localDate
        ? await this.toUtc(event.localDate, event.localEndTime, event.timeZone ?? this.defaultTimeZone)
        : null,
      localDate: event.localDate ?? null,
      localTime: event.localTime ?? null,
      timeZone: event.timeZone ?? this.defaultTimeZone,
      isRecurring: event.isRecurring,
      recurrenceRule: event.recurrenceRule ? JSON.stringify(event.recurrenceRule) : null,
      recurrenceText: event.recurrenceText ?? null,
      recurrenceConfidence: event.recurrenceConfidence,
      venueName: sanitizeForDb(event.venueName) ?? null,
      address: sanitizeForDb(event.address) ?? null,
      city: event.city ?? null,
      state: event.state ?? null,
      zip: event.zip ?? null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
      price: event.price ?? null,
      priceText: event.priceText ?? null,
      organizerName: sanitizeForDb(event.organizerName) ?? null,
      registrationUrl: event.registrationUrl ?? null,
      sourceUrl: sanitizeForDb(event.sourceUrl) ?? '',
      sourceUrlCanonical: event.sourceUrlCanonical ?? event.sourceUrl,
      confidence,
      qaStatus,
      qaReasons: JSON.stringify(reasons),
      dedupeKey: key,
      lastSeenAt: new Date(),
    }

    // Every string that reaches the database is cleaned in one sweep. Scraped
    // text can contain lone backslashes and control characters, and a single
    // invalid escape sequence makes Postgres reject the whole insert.
    for (const key of Object.keys(data)) {
      const value = (data as Record<string, unknown>)[key]
      if (typeof value === 'string') {
        (data as Record<string, unknown>)[key] = sanitizeForDb(value)
      }
    }

    // Idempotent upsert on (sourceId, dedupeKey)
    const existing = await this.prisma.candidateEvent.findFirst({
      where: { sourceId, dedupeKey: key },
    })

    // Never overwrite good data with null: a candidate that was geocoded
    // earlier keeps its coordinates even when the page does not repeat them.
    if (existing) {
      if (data.lat === null) data.lat = existing.lat
      if (data.lng === null) data.lng = existing.lng
      if (!data.city && existing.city) data.city = existing.city
      if (!data.state && existing.state) data.state = existing.state
      if (!data.zip && existing.zip) data.zip = existing.zip
      if (!data.address && existing.address) data.address = existing.address
      if (!data.venueName && existing.venueName) data.venueName = existing.venueName
      if (!data.organizerName && existing.organizerName) data.organizerName = existing.organizerName
    }

    const candidate = existing
      ? await this.prisma.candidateEvent.update({ where: { id: existing.id }, data })
      : await this.prisma.candidateEvent.create({ data })

    // A candidate seen again is current again.
    if (existing?.isExpired) {
      await this.prisma.candidateEvent.update({ where: { id: existing.id }, data: { isExpired: false } })
    }

    // Evidence rows
    for (const ev of event.evidence ?? []) {
      await this.prisma.sourceEvidence.create({
        data: {
          sourceId,
          candidateEventId: candidate.id,
          url: sanitizeForDb(event.sourceUrl) ?? '',
          fieldName: sanitizeForDb(ev.field) ?? '',
          fieldValue: sanitizeForDb(ev.value) ?? '',
          excerpt: sanitizeForDb(ev.excerpt) ?? null,
          method: ev.method,
        },
      })
    }

    // Recurrence rule record
    if (event.isRecurring && event.recurrenceRule) {
      const sKey = seriesKey(event)
      try {
        await this.prisma.recurrenceRule.create({
          data: {
            candidateEventId: candidate.id,
            seriesKey: sKey ?? stableHash(key),
            ruleJson: JSON.stringify(event.recurrenceRule),
            timeZone: event.recurrenceRule.timeZone,
            interval: event.recurrenceRule.interval,
            byDay: JSON.stringify(event.recurrenceRule.byDay),
            until: event.recurrenceRule.until ? new Date(`${event.recurrenceRule.until}T00:00:00Z`) : null,
            count: event.recurrenceRule.count ?? null,
            exceptions: JSON.stringify(event.recurrenceRule.exceptions),
            originalText: sanitizeForDb(event.recurrenceRule.originalText) ?? null,
            confidence: event.recurrenceRule.confidence,
            status: 'PROPOSED',
            sourceUrl: sanitizeForDb(event.sourceUrl) ?? '',
            expiresAt: event.recurrenceRule.until
              ? new Date(`${event.recurrenceRule.until}T00:00:00Z`)
              : new Date(Date.now() + 180 * 86400000),
          },
        })
      } catch (error) {
        // A rule we cannot store must not cost us the candidate. The rule is
        // a proposal for a human to check; the candidate is the evidence.
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[atlas] recurrence rule not stored for "${event.title}": ${message.slice(0, 120)}`)
      }
    }

    // Proposed matches — never auto-merged
    for (const m of matches) {
      await this.prisma.entityMatch.create({
        data: {
          candidateEventId: candidate.id,
          existingEventId: m.existingId.startsWith('event:') ? m.existingId.slice(6) : null,
          matchType: m.matchType,
          score: m.score,
          status: m.deterministic ? 'PROPOSED' : 'PROPOSED',
          reason: sanitizeForDb(m.reason) ?? null,
        },
      })
    }

    return candidate.id
  }

  private async persistSchool(sourceId: string, school: ReturnType<typeof extractSchool>) {
    if (!school) return
    const key = stableHash(`${school.businessName}|${school.address ?? ''}`)
    const existing = await this.prisma.candidateSchool.findFirst({
      where: { sourceId, dedupeKey: key },
    })
    const data = {
      businessName: sanitizeForDb(school.businessName) ?? '',
      websiteUrl: sanitizeForDb(school.websiteUrl) ?? null,
      address: sanitizeForDb(school.address) ?? null,
      city: school.city ?? null,
      state: school.state ?? null,
      zip: school.zip ?? null,
      phone: sanitizeForDb(school.phone) ?? null,
      contactChannel: sanitizeForDb(school.contactChannel) ?? null,
      styles: JSON.stringify(school.styles),
      classScheduleUrl: sanitizeForDb(school.classScheduleUrl) ?? null,
      instructorDirectoryUrl: sanitizeForDb(school.instructorDirectoryUrl) ?? null,
      sourceUrl: sanitizeForDb(school.sourceUrl) ?? '',
      dedupeKey: key,
      lastSeenAt: new Date(),
    }
    if (existing) await this.prisma.candidateSchool.update({ where: { id: existing.id }, data })
    else await this.prisma.candidateSchool.create({ data: { sourceId, ...data } })
  }

  /** Load published events + existing candidates for dedupe comparison. */
  /**
   * Load published events + existing candidates for dedupe comparison.
   *
   * Only candidates whose date falls inside the comparison window are loaded.
   * Comparing every candidate against every other is O(n²) and produced
   * thousands of meaningless match rows during the pilot.
   */
  private async loadExistingRecords(candidate: ExtractedEvent): Promise<ExistingRecord[]> {
    const windowDays = 14
    let from: string | undefined
    let to: string | undefined
    if (candidate.localDate) {
      const anchor = Date.parse(`${candidate.localDate}T00:00:00Z`)
      if (!Number.isNaN(anchor)) {
        from = new Date(anchor - windowDays * 86400000).toISOString().slice(0, 10)
        to = new Date(anchor + windowDays * 86400000).toISOString().slice(0, 10)
      }
    }

    const events = await this.prisma.event.findMany({
      select: {
        id: true, title: true, sourceUrl: true, address: true, venueName: true,
        city: true, state: true, organizerName: true, recurrenceGroupId: true,
        isRecurring: true, publishedVia: true, startDateTime: true, submittedByUserId: true,
      },
    })
    const candidates = await this.prisma.candidateEvent.findMany({
      where: from && to ? { localDate: { gte: from, lte: to } } : {},
      select: {
        id: true, title: true, sourceUrlCanonical: true, localDate: true,
        localTime: true, address: true, venueName: true, city: true, state: true,
        organizerName: true,
      },
    })

    const records: ExistingRecord[] = []
    for (const e of events) {
      records.push({
        id: `event:${e.id}`,
        title: e.title,
        sourceUrl: e.sourceUrl,
        localDate: e.startDateTime ? e.startDateTime.toISOString().slice(0, 10) : null,
        localTime: e.startDateTime ? e.startDateTime.toISOString().slice(0, 11).slice(11, 16) : null,
        address: e.address,
        venueName: e.venueName,
        city: e.city,
        state: e.state,
        organizerName: e.organizerName,
        isOrganizerOwned: e.publishedVia === 'ORGANIZER' || Boolean(e.submittedByUserId),
        publishedVia: e.publishedVia,
        recurrenceGroupId: e.recurrenceGroupId,
        isRecurring: e.isRecurring,
      })
    }
    for (const c of candidates) {
      records.push({
        id: `candidate:${c.id}`,
        title: c.title,
        sourceUrl: c.sourceUrlCanonical,
        localDate: c.localDate,
        localTime: c.localTime,
        address: c.address,
        venueName: c.venueName,
        city: c.city,
        state: c.state,
        organizerName: c.organizerName,
        isOrganizerOwned: false,
      })
    }
    return records
  }

  private async recordAttempt(
    sourceId: string,
    data: {
      status: string
      url: string
      httpStatus?: number
      durationMs?: number
      bytes?: number
      contentHash?: string
      errorCode?: string
      errorMessage?: string
      extractionMethod?: string
      candidatesFound?: number
      candidatesAccepted?: number
      costUsd?: number
    }
  ) {
    if (this.dryRun) return
    const job = await this.prisma.crawlJob.create({
      data: {
        sourceId,
        jobType: 'CRAWL',
        status: data.status === 'SUCCESS' ? 'SUCCEEDED' : data.status === 'FAILED' ? 'FAILED' : 'SKIPPED',
        startedAt: new Date(),
        finishedAt: new Date(),
        attempts: 1,
        lastError: sanitizeForDb(data.errorMessage) ?? null,
        costUsd: data.costUsd ?? 0,
      },
    })
    await this.prisma.crawlAttempt.create({
      data: {
        jobId: job.id,
        attemptNumber: 1,
        status: data.status,
        httpStatus: data.httpStatus ?? null,
        url: sanitizeForDb(data.url) ?? '',
        durationMs: data.durationMs ?? null,
        bytes: data.bytes ?? null,
        contentHash: data.contentHash ?? null,
        errorCode: sanitizeForDb(data.errorCode) ?? null,
        errorMessage: sanitizeForDb(data.errorMessage) ?? null,
        extractionMethod: data.extractionMethod ?? null,
        candidatesFound: data.candidatesFound ?? 0,
        candidatesAccepted: data.candidatesAccepted ?? 0,
        // Deterministic extraction costs nothing; only the LLM tier is billed.
        costUsd: data.costUsd ?? 0,
      },
    })
  }

  private async toUtc(localDate: string, localTime: string, timeZone: string): Promise<Date | null> {
    const { wallTimeToUtc } = await import('./recurrence')
    return wallTimeToUtc(localDate, localTime, timeZone)
  }
}

function backoffMs(consecutiveFailures: number): number {
  const hours = Math.min(72, 2 ** Math.min(consecutiveFailures, 6))
  return hours * 3600000
}
