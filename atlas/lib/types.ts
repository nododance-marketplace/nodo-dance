/**
 * Shared types for the Nodo Atlas ingestion pipeline.
 *
 * Pipeline stages (mirrors the required separation):
 *   Raw source data → Extracted candidate → Validated candidate → Approved publication
 */

/**
 * Canonical vocabularies.
 *
 * Imported from the app's own constants rather than redeclared, so Atlas can
 * never drift from what the marketplace publishes. (Drift here would silently
 * create "Other" records the site cannot display.)
 */
import { DANCE_STYLES as APP_DANCE_STYLES, EVENT_TYPES as APP_EVENT_TYPES } from '../../src/lib/constants'

export type DanceStyle = (typeof APP_DANCE_STYLES)[number]
export type NodoEventType = (typeof APP_EVENT_TYPES)[number]['value']

export const CANONICAL_DANCE_STYLES = APP_DANCE_STYLES
export const CANONICAL_EVENT_TYPES = APP_EVENT_TYPES.map(e => e.value)

export type ExtractionMethod = 'JSONLD' | 'RSS' | 'ICAL' | 'HTML' | 'LLM' | 'API'

export type SourceCategory =
  | 'SCHOOL'
  | 'STUDIO'
  | 'EVENT_ORG'
  | 'VENUE'
  | 'DIRECTORY'
  | 'INSTRUCTOR'
  | 'AGGREGATOR'

/** A record extracted from a source page, before validation. */
export interface ExtractedEvent {
  title: string
  description?: string
  eventType?: NodoEventType
  styles: DanceStyle[]
  otherStyle?: string

  /** Wall-clock date as published (YYYY-MM-DD). Null when the page omits it. */
  localDate?: string
  /** Wall-clock time as published (HH:MM, 24h). Null when the page omits it. */
  localTime?: string
  /** Wall-clock end time (HH:MM). */
  localEndTime?: string
  endLocalDate?: string
  /** IANA zone of the venue. */
  timeZone?: string

  isRecurring: boolean
  recurrenceText?: string
  recurrenceRule?: RecurrenceRuleSpec
  recurrenceConfidence: number

  venueName?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  lat?: number
  lng?: number

  price?: number
  priceText?: string

  organizerName?: string
  registrationUrl?: string

  sourceUrl: string
  sourceUrlCanonical?: string

  /** Which fields the extractor actually found — drives confidence. */
  foundFields: string[]
  extractionMethod: ExtractionMethod
  /** Per-field provenance for review. */
  evidence?: FieldEvidence[]
}

export interface FieldEvidence {
  field: string
  value: string
  excerpt?: string
  method: ExtractionMethod
}

export interface RecurrenceRuleSpec {
  /** RFC 5545 RRULE fragment, e.g. "FREQ=WEEKLY;BYDAY=WE" */
  rrule: string
  interval: number
  /** 0 = Sunday … 6 = Saturday */
  byDay: number[]
  until?: string // YYYY-MM-DD
  count?: number
  exceptions: string[] // YYYY-MM-DD
  timeZone: string
  originalText?: string
  confidence: number
}

/** A school/studio business record extracted from a source page. */
export interface ExtractedSchool {
  businessName: string
  websiteUrl?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  contactChannel?: string
  styles: DanceStyle[]
  classScheduleUrl?: string
  instructorDirectoryUrl?: string
  sourceUrl: string
  foundFields: string[]
  extractionMethod: ExtractionMethod
}

export interface FetchResult {
  url: string
  finalUrl: string
  status: number
  body: string
  contentType: string
  contentHash: string
  etag?: string
  lastModified?: string
  notModified: boolean
  durationMs: number
  bytes: number
}

export interface CrawlPolicy {
  /** Minimum milliseconds between requests to the same domain. */
  politenessDelayMs: number
  userAgent: string
  requestTimeoutMs: number
  maxBytes: number
  maxRetries: number
}

export const DEFAULT_POLICY: CrawlPolicy = {
  politenessDelayMs: 2000,
  userAgent:
    'NodoAtlasBot/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com) respects-robots.txt',
  requestTimeoutMs: 20000,
  maxBytes: 5 * 1024 * 1024,
  maxRetries: 2,
}
