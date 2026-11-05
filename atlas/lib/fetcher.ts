/**
 * HTTP fetch layer for Atlas.
 *
 * Guarantees:
 *  - One request per domain at a time, with a politeness delay between them.
 *  - Conditional requests (ETag / Last-Modified) so unchanged pages cost nothing.
 *  - Hard byte cap and timeout on every response.
 *  - No proxy rotation, no user-agent spoofing, no CAPTCHA or auth bypass.
 */
import { createHash } from 'node:crypto'
import { DEFAULT_POLICY, type CrawlPolicy, type FetchResult } from './types'

export interface FetchOptions {
  etag?: string
  lastModified?: string
  headers?: Record<string, string>
  /** HTTP method. Defaults to GET. */
  method?: 'GET' | 'POST'
  /** Request body for POST requests (form-encoded for Overpass). */
  body?: string
  /** Override the request timeout for slow endpoints (e.g. Overpass). */
  timeoutMs?: number
  /** Override the retry count — mirror fallback usually handles failures. */
  maxRetries?: number
}

export class Fetcher {
  readonly policy: CrawlPolicy
  private lastRequestAt = new Map<string, number>()
  private domainChain = new Map<string, Promise<unknown>>()
  /** Per-domain politeness overrides, e.g. from a robots.txt Crawl-delay. */
  private domainDelay = new Map<string, number>()

  constructor(policy: Partial<CrawlPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy }
  }

  /** Apply a robots.txt Crawl-delay for a domain (milliseconds). */
  setDomainDelay(domain: string, delayMs: number): void {
    if (delayMs > 0) this.domainDelay.set(domain, delayMs)
  }

  private async politeWait(domain: string, extraDelayMs = 0): Promise<void> {
    const last = this.lastRequestAt.get(domain) ?? 0
    const delay = Math.max(this.policy.politenessDelayMs, this.domainDelay.get(domain) ?? 0) + extraDelayMs
    const wait = delay - (Date.now() - last)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.lastRequestAt.set(domain, Date.now())
  }

  /** Serialize requests per domain. */
  private async withDomainLock<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.domainChain.get(domain) ?? Promise.resolve()
    const next = previous.then(fn, fn)
    this.domainChain.set(
      domain,
      next.catch(() => undefined)
    )
    return next
  }

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const domain = new URL(url).hostname
    const maxRetries = options.maxRetries ?? this.policy.maxRetries
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.withDomainLock(domain, () => this.fetchInternal(url, options))
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        // Only transient failures are worth retrying.
        const transient = /HTTP (429|5\d\d)/.test(lastError.message) || /fetch failed/.test(lastError.message)
        if (!transient || attempt === maxRetries) break
        const backoff = 1000 * 2 ** attempt
        await new Promise(r => setTimeout(r, backoff))
      }
    }
    throw lastError ?? new Error(`fetch failed for ${url}`)
  }

  private async fetchInternal(url: string, options: FetchOptions): Promise<FetchResult> {
    const started = Date.now()
    const domain = new URL(url).hostname
    await this.politeWait(domain)

    const headers: Record<string, string> = {
      'User-Agent': this.policy.userAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers,
    }
    if (options.etag) headers['If-None-Match'] = options.etag
    if (options.lastModified) headers['If-Modified-Since'] = options.lastModified

    const controller = new AbortController()
    const timeoutMs = options.timeoutMs ?? this.policy.requestTimeoutMs
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch (error) {
      // Surface the underlying cause (TLS, DNS, timeout) — "fetch failed" alone
      // is useless for operators.
      const cause = (error as { cause?: { code?: string; message?: string } })?.cause
      const detail = cause?.code ?? cause?.message ?? ''
      throw new Error(`fetch failed${detail ? `: ${detail}` : ''}`)
    } finally {
      clearTimeout(timer)
    }

    const status = response.status
    const contentType = response.headers.get('content-type') ?? ''
    const etag = response.headers.get('etag') ?? undefined
    const lastModified = response.headers.get('last-modified') ?? undefined

    if (status === 304) {
      return {
        url,
        finalUrl: response.url || url,
        status,
        body: '',
        contentType,
        contentHash: '',
        etag,
        lastModified,
        notModified: true,
        durationMs: Date.now() - started,
        bytes: 0,
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${status} for ${url}`)
    }

    const buffer = await readCapped(response, this.policy.maxBytes)
    const body = buffer.toString('utf8')
    const contentHash = createHash('sha256').update(buffer).digest('hex')

    return {
      url,
      finalUrl: response.url || url,
      status,
      body,
      contentType,
      contentHash,
      etag,
      lastModified,
      notModified: false,
      durationMs: Date.now() - started,
      bytes: buffer.byteLength,
    }
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.from(await response.text())
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      break
    }
  }
  return Buffer.concat(chunks).subarray(0, maxBytes)
}
