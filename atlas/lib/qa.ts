/**
 * Quality Assurance (Atlas Agent F).
 *
 * Two responsibilities:
 *  1. Score confidence from which fields were actually found.
 *  2. Decide PASS / QUARANTINE / REJECT with explicit, human-readable reasons.
 *
 * Confidence is a prioritisation signal, never a proof of correctness.
 */
import { detectStyles } from './normalize'
import type { ExtractedEvent } from './types'

export type QaStatus = 'PASS' | 'QUARANTINE' | 'REJECT'

export interface QaResult {
  status: QaStatus
  confidence: number
  reasons: string[]
  warnings: string[]
}

/** Field weights. A record missing a high-weight field is not publishable as-is. */
const FIELD_WEIGHTS: Record<string, number> = {
  title: 0.18,
  startDateTime: 0.28,
  localDate: 0.14,
  localTime: 0.08,
  venueName: 0.12,
  address: 0.1,
  city: 0.06,
  description: 0.04,
  organizerName: 0.03,
  eventType: 0.02,
  styles: 0.02,
  registrationUrl: 0.02,
  price: 0.01,
}

export function scoreConfidence(event: ExtractedEvent): number {
  let score = 0
  for (const field of event.foundFields) score += FIELD_WEIGHTS[field] ?? 0
  if (event.extractionMethod === 'JSONLD') score += 0.15
  else if (event.extractionMethod === 'RSS' || event.extractionMethod === 'ICAL') score += 0.08
  else if (event.extractionMethod === 'HTML') score += 0
  else if (event.extractionMethod === 'LLM') score += 0.05

  // Recurrence with a bounded horizon is worth more than an unbounded claim.
  if (event.isRecurring && event.recurrenceRule?.until) score += 0.05
  if (event.isRecurring && event.recurrenceConfidence < 0.6) score -= 0.05

  return Math.max(0, Math.min(1, Number(score.toFixed(3))))
}

export interface QaContext {
  /** Wall-clock now in the source's timezone (for expiry checks). */
  now: Date
  /** The source's permissions status. */
  permissionsStatus?: string
  /** The source's robots decision. */
  robotsAllowed?: boolean
  /** Known location for the source (city) to detect contradictions. */
  sourceCity?: string
  sourceState?: string
  /** The page text used for the dance-relevance check. */
  pageText?: string
  /** True when the page explicitly says an event is cancelled. */
  explicitlyCancelled?: boolean
}

const CANCEL_PATTERNS = [
  /\bcancell?ed\b/i,
  /\bcanceled\b/i,
  /\bpostponed\b/i,
  /\breschedul?ed\b/i,
  /\bno (?:class|event|social) (?:this|on)\b/i,
]

export function validateEvent(event: ExtractedEvent, ctx: QaContext): QaResult {
  const reasons: string[] = []
  const warnings: string[] = []
  const confidence = scoreConfidence(event)

  // ── Hard rejections ──────────────────────────────────────────────────────
  if (ctx.permissionsStatus === 'DENIED') {
    reasons.push('Source permissions denied')
  }
  if (ctx.robotsAllowed === false) {
    reasons.push('robots.txt disallows this path')
  }
  if (!event.sourceUrl) {
    reasons.push('No traceable source URL')
  }
  if (!event.localDate) {
    reasons.push('No reliable date information')
  }
  if (!event.title || event.title.trim().length < 3) {
    reasons.push('Missing title')
  }

  // Dance relevance — two separate questions.
  //
  // 1. Does the page as a whole talk about dance? It may name its styles
  //    far down the body, so the whole page is fair game.
  // 2. Does this record itself look like a dance event?
  //
  // A page can pass the first and fail the second. A ballet company's
  // "Jobs" page and a contemporary company's season page both mention
  // dance while listing something that is not a dance event at all.
  if (ctx.pageText) {
    const pageHaystack = `${event.title} ${event.description ?? ''} ${ctx.pageText} ${event.sourceUrl}`
    const styles = detectStyles(pageHaystack)
    const genericDanceSignal = /\b(dance|dancing|social|class|studio|milonga|practica|practice|zouk|salsa|bachata|partner)\b/i.test(pageHaystack)
    if (styles.length === 0 && !genericDanceSignal) {
      reasons.push('No dance-related signal found on the page')
    }
  }

  // The record's own text — title, description, venue, organiser — has to
  // carry the dance signal. This is a quarantine, not a rejection: a human
  // may still see a dance event in a record we could not read well.
  {
    const own = `${event.title} ${event.description ?? ''} ${event.venueName ?? ''} ${event.organizerName ?? ''}`
    const ownStyles = detectStyles(own)
    const ownSignal = /\b(salsa|bachata|tango|milonga|zouk|kizomba|shag|swing|cumbia|walle?z|foxtrot|cha\s?cha|jive|samba|ballroom|line\s?danc|partner)\b/i.test(own)
    if (ownStyles.length === 0 && !ownSignal) {
      reasons.push('Record carries no dance-related signal of its own')
    }
  }

  // Expiry: a dated event in the past is not publishable.
  if (event.localDate) {
    const eventDate = Date.parse(`${event.localDate}T00:00:00Z`)
    const now = Date.parse(`${ctx.now.toISOString().slice(0, 10)}T00:00:00Z`)
    if (!Number.isNaN(eventDate) && eventDate < now - 86400000 * 2) {
      reasons.push('Event date is in the past')
    }
  }

  // Explicit cancellation is a REJECT — it is a real signal, not an error.
  if (ctx.explicitlyCancelled) {
    reasons.push('Event explicitly marked as cancelled or rescheduled')
  }

  // Contradictory location: event city disagrees with the source's city.
  if (event.city && ctx.sourceCity && ctx.sourceState) {
    const evCity = event.city.toLowerCase()
    const srcCity = ctx.sourceCity.toLowerCase()
    if (evCity !== srcCity && !srcCity.includes(evCity) && !evCity.includes(srcCity)) {
      warnings.push(`Event city "${event.city}" differs from source city "${ctx.sourceCity}"`)
    }
  }

  // ── Quarantine conditions ────────────────────────────────────────────────
  if (!event.venueName && !event.address) {
    reasons.push('No location information')
  }
  if (event.isRecurring && !event.recurrenceRule?.until && !event.recurrenceRule?.count) {
    reasons.push('Recurring claim without an explicit end (unbounded series)')
  }
  if (event.isRecurring && event.recurrenceConfidence < 0.6) {
    reasons.push('Recurrence pattern is ambiguous')
  }
  if (event.localTime === undefined) {
    reasons.push('No time information')
  }
  if (event.eventType === undefined) {
    warnings.push('Event type could not be determined')
  }
  if (event.styles.length === 1 && event.styles[0] === 'Other') {
    warnings.push('Dance style unresolved')
  }
  if (event.priceText && event.price === undefined) {
    warnings.push(`Price text not parsed: "${event.priceText}"`)
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  const hardRejects = [
    'Source permissions denied',
    'robots.txt disallows this path',
    'No traceable source URL',
    'No reliable date information',
    'Missing title',
    'No dance-related signal found on the page',
    'Event date is in the past',
    'Event explicitly marked as cancelled or rescheduled',
  ]
  const hasHardReject = reasons.some(r => hardRejects.includes(r))

  let status: QaStatus = 'PASS'
  if (hasHardReject) status = 'REJECT'
  else if (reasons.length > 0) status = 'QUARANTINE'

  // Low-confidence records are quarantined for human eyes, never published.
  if (status === 'PASS' && confidence < 0.45) {
    status = 'QUARANTINE'
    reasons.push(`Confidence ${confidence.toFixed(2)} below publication threshold (0.45)`)
  }

  return { status, confidence, reasons, warnings }
}

export function isCancellationNotice(text: string): boolean {
  if (!text) return false
  // Scope matters: a school site may mention "cancelled" in an unrelated
  // section. Only treat a notice as a cancellation when it reads like one.
  const scoped = CANCEL_PATTERNS.some(p => p.test(text))
  if (!scoped) return false
  return /\b(cancell?ed|canceled|postponed|reschedul?ed)\b/i.test(text) &&
    /\b(this|tonight|today|next|upcoming|the)\b.{0,40}\b(class|event|social|night|workshop|practica|milonga)\b/i.test(text)
}
