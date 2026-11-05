/**
 * LLM extraction client for Atlas (tier 5 of the extraction ladder).
 *
 * The sidecar is optional. When it is not configured, Atlas stays entirely on
 * the deterministic ladder — which is how the Charlotte pilot ran at $0.
 *
 * When it IS configured, it is used only where the deterministic pass failed to
 * produce a usable record. It never bypasses QA: an LLM-extracted candidate
 * enters the same review queue with the same rules.
 */
import type { ExtractedEvent } from './types'

export interface LlmExtractionSchema {
  title: string
  eventType?: string
  styles?: string[]
  startDate?: string
  startTime?: string
  endTime?: string
  venueName?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  organizerName?: string
  price?: number
  priceText?: string
  registrationUrl?: string
  description?: string
  isRecurring?: boolean
  recurrenceText?: string
}

export interface LlmResult {
  ok: boolean
  data?: LlmExtractionSchema
  costUsd?: number
  durationMs?: number
  error?: string
}

export interface LlmOptions {
  sidecarUrl?: string
  secret?: string
  timeoutMs?: number
  /** Model label recorded on the candidate for traceability. */
  model?: string
}

export const DEFAULT_LLM_SCHEMA: LlmExtractionSchema = {
  title: '',
  eventType: '',
  styles: [],
  startDate: '',
  startTime: '',
  endTime: '',
  venueName: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  organizerName: '',
  price: 0,
  priceText: '',
  registrationUrl: '',
  description: '',
  isRecurring: false,
  recurrenceText: '',
}

export class LlmExtractor {
  private sidecarUrl?: string
  private secret?: string
  private timeoutMs: number
  readonly model: string

  constructor(options: LlmOptions = {}) {
    this.sidecarUrl = options.sidecarUrl ?? process.env.ATLAS_SIDECAR_URL
    this.secret = options.secret ?? process.env.ATLAS_SIDECAR_SECRET
    this.timeoutMs = options.timeoutMs ?? 120000
    this.model = options.model ?? process.env.ATLAS_LLM_MODEL ?? 'openai/gpt-5-nano'
  }

  get enabled(): boolean {
    return Boolean(this.sidecarUrl)
  }

  /** Ask the sidecar to extract an event record from a URL. */
  async extract(url: string, timeZone: string): Promise<LlmResult> {
    if (!this.enabled) return { ok: false, error: 'LLM sidecar is not configured' }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(`${this.sidecarUrl}/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.secret ? { 'X-Atlas-Secret': this.secret } : {}),
        },
        body: JSON.stringify({
          url,
          schema: DEFAULT_LLM_SCHEMA,
          timeZone,
          extractInstructions:
            'Extract every publicly advertised dance event on this page. ' +
            'Return the title, date, time, dance style, event type, venue, ' +
            'address, organiser and price if explicitly stated. Use null for ' +
            'anything that is not on the page.',
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, error: `sidecar HTTP ${res.status}: ${body.slice(0, 200)}` }
      }

      const json = (await res.json()) as LlmResult
      return json
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** Convert a sidecar payload into an Atlas candidate. */
  toCandidate(result: LlmResult, url: string, timeZone: string): ExtractedEvent | null {
    const data = result.data
    if (!data || !data.title) return null

    const foundFields: string[] = ['title']
    if (data.startDate) foundFields.push('startDateTime', 'localDate')
    if (data.startTime) foundFields.push('localTime')
    if (data.venueName) foundFields.push('venueName')
    if (data.address) foundFields.push('address')
    if (data.description) foundFields.push('description')
    if (data.organizerName) foundFields.push('organizerName')
    if (data.price) foundFields.push('price')
    if (data.eventType) foundFields.push('eventType')
    if (data.styles?.length) foundFields.push('styles')

    return {
      title: data.title,
      description: data.description || undefined,
      eventType: (data.eventType as ExtractedEvent['eventType']) || undefined,
      styles: (data.styles ?? []) as ExtractedEvent['styles'],
      localDate: data.startDate || undefined,
      localTime: data.startTime || undefined,
      localEndTime: data.endTime || undefined,
      timeZone,
      isRecurring: Boolean(data.isRecurring),
      recurrenceText: data.recurrenceText || undefined,
      recurrenceConfidence: data.isRecurring ? 0.6 : 0,
      venueName: data.venueName || undefined,
      address: data.address || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      zip: data.zip || undefined,
      price: data.price || undefined,
      priceText: data.priceText || undefined,
      organizerName: data.organizerName || undefined,
      registrationUrl: data.registrationUrl || undefined,
      sourceUrl: url,
      foundFields,
      extractionMethod: 'LLM',
    }
  }
}
