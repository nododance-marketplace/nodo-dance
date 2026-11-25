/**
 * Event validity agent — the "trust ladder".
 *
 * Every organizer submission is evaluated before it goes live:
 *
 *   1. Deterministic pre-checks (no LLM, no cost): partner-dance scope,
 *      future date, venue/address present, obvious spam tokens. A hard fail
 *      here rejects the event without ever calling an LLM.
 *   2. Gray zone → one LLM call (Gemini preferred, then Anthropic) asking
 *      for a strict-JSON verdict: AUTO_PUBLISH | QUEUE | REJECT.
 *   3. Decision policy (see decideStatus):
 *      REJECT  → Event status REJECTED (reason returned to the submitter)
 *      QUEUE   → Event stays PENDING for admin review
 *      AUTO_PUBLISH → Event status APPROVED, published immediately
 *
 * Fail-safe: when no LLM key is configured or the provider errors, every
 * submission lands in PENDING. The agent can never auto-publish while down.
 */

import { isPartnerDanceBusiness } from '../../atlas/lib/partner-dance'
import { prisma } from './prisma'

export type ValidityDecision = 'AUTO_PUBLISH' | 'QUEUE' | 'REJECT'
export type EventStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface EventValidityInput {
  title: string
  description: string
  styles: string[]
  otherStyle?: string | null
  venueName?: string | null
  address?: string | null
  city?: string | null
  startDateTime: Date
  submitterTrustScore: number
}

export interface ValidityVerdict {
  /** Final Event status to store. */
  status: EventStatus
  /** Which stage decided: deterministic checks, the LLM, or the fail-safe. */
  decidedBy: 'PRE_CHECKS' | 'LLM' | 'FAILSAFE'
  /** LLM provider used, when one was consulted. */
  provider?: 'gemini' | 'anthropic'
  /** Human-readable reasons, safe to show the submitter on REJECT. */
  reasons: string[]
}

// ─────────────────────────────────────────────────────────────
// Deterministic pre-checks
// ─────────────────────────────────────────────────────────────

/** Obvious spam: crypto shilling, pharma, seo-bait, scams. */
const SPAM_TOKENS = new RegExp(
  [
    'crypto', 'bitcoin', 'ethereum', 'nft\\b', 'forex', 'viagra', 'cialis',
    'casino', 'betting', 'escort', 'webcam', 'onlyfans',
    'seo\\s*services', 'backlinks?', 'guest\\s*posts?', 'guest\\s*blog',
    'cheap\\s*followers', 'buy\\s*followers', 'buy\\s*likes',
    'work\\s*from\\s*home', 'make\\s*money\\s*online', 'passive\\s*income',
    'telegram\\s*channel', 'whatsapp\\s*group\\s*(link|join)',
  ].join('|'),
  'i'
)

/** More than this many links in one listing is url-flooding. */
const MAX_URLS = 2

function runPreChecks(input: EventValidityInput): string[] {
  const failures: string[] = []

  // 1. Scope: must read as a partner-dance event. The title, free-text style
  //    and description are run through the same patterns the Atlas census
  //    uses, so a salsa social passes and a sandwich shop never does.
  const freeText = [
    input.title,
    input.otherStyle || '',
    input.description,
    input.styles.join(' '),
  ].join(' ')
  if (!isPartnerDanceBusiness(freeText)) {
    failures.push('This does not look like a partner dance event.')
  }

  // 2. Date must be in the future.
  if (input.startDateTime.getTime() <= Date.now()) {
    failures.push('The event date is in the past.')
  }

  // 3. Venue or address must be present.
  if (!input.address?.trim() && !input.venueName?.trim()) {
    failures.push('A venue or address is required.')
  }

  // 4. Obvious spam tokens.
  if (SPAM_TOKENS.test(freeText)) {
    failures.push('The listing contains content flagged as spam.')
  }

  // 5. URL flooding.
  const urlCount = (freeText.match(/https?:\/\//g) || []).length
  if (urlCount > MAX_URLS) {
    failures.push('Too many links in the listing.')
  }

  return failures
}

// ─────────────────────────────────────────────────────────────
// LLM gray-zone evaluation
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the content moderator for Nodo Dance, a partner-dance event directory (salsa, bachata, tango, kizomba, zouk, west coast swing, ballroom, cumbia and similar).

Judge event submissions and reply with STRICT JSON only — no markdown fences, no prose:
{"decision":"AUTO_PUBLISH"|"QUEUE"|"REJECT","partnerDance":true|false,"confidence":0-1,"reasons":["short reason", ...]}

Rules:
- "partnerDance": true only when the event is genuinely a partner-dance social, class, workshop, milonga or festival.
- REJECT: out of scope (not partner dance), spam, scam, offensive, or clearly fake/incomplete listing data.
- QUEUE: plausible but you are not confident — a human should review.
- AUTO_PUBLISH: clearly a real partner-dance event with coherent venue and date details.
- confidence is your 0-1 certainty in the decision.
- reasons is a short array of strings (max 3).`

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

interface LlmVerdict {
  decision: ValidityDecision
  partnerDance: boolean
  confidence: number
  reasons: string[]
}

async function callGemini(userContent: string): Promise<LlmVerdict | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  )
  if (!res.ok) {
    console.error('[Validity] Gemini API error:', res.status)
    return null
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return null
  const parsed = extractJson(text)
  return parseLlmVerdict(parsed)
}

async function callAnthropic(userContent: string): Promise<LlmVerdict | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 400,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    console.error('[Validity] Anthropic API error:', res.status)
    return null
  }
  const data = await res.json()
  const text: string | undefined = data?.content?.[0]?.text
  if (!text) return null
  const parsed = extractJson(text)
  return parseLlmVerdict(parsed)
}

function parseLlmVerdict(parsed: Record<string, unknown> | null): LlmVerdict | null {
  if (!parsed) return null
  const decision = String(parsed.decision || '').toUpperCase()
  if (!['AUTO_PUBLISH', 'QUEUE', 'REJECT'].includes(decision)) return null
  const confidence = typeof parsed.confidence === 'number'
    ? Math.min(1, Math.max(0, parsed.confidence))
    : 0
  const reasons = Array.isArray(parsed.reasons)
    ? (parsed.reasons as unknown[]).map(String).slice(0, 3)
    : []
  return {
    decision: decision as ValidityDecision,
    partnerDance: parsed.partnerDance === true,
    confidence,
    reasons,
  }
}

function buildUserContent(input: EventValidityInput): string {
  return [
    `Title: ${input.title}`,
    `Styles: ${input.styles.join(', ')}${input.otherStyle ? ` / ${input.otherStyle}` : ''}`,
    `Venue: ${input.venueName || '(none given)'}`,
    `Address: ${input.address || '(none given)'}`,
    `City: ${input.city || '(unknown)'}`,
    `Date: ${input.startDateTime.toISOString()}`,
    `Submitter trust score: ${input.submitterTrustScore}`,
    '',
    'Description:',
    input.description,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────
// Top-level evaluation
// ─────────────────────────────────────────────────────────────

export function hasValidityAgent(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY)
}

export async function evaluateEventSubmission(
  input: EventValidityInput
): Promise<ValidityVerdict> {
  // Stage 1: deterministic pre-checks. Hard failures never reach the LLM.
  const preCheckFailures = runPreChecks(input)
  if (preCheckFailures.length > 0) {
    return { status: 'REJECTED', decidedBy: 'PRE_CHECKS', reasons: preCheckFailures }
  }

  // Fail-safe: without an LLM key everything goes to PENDING for review.
  // Never auto-publish while the agent is down.
  if (!hasValidityAgent()) {
    return {
      status: 'PENDING',
      decidedBy: 'FAILSAFE',
      reasons: ['Validity agent not configured — queued for manual review.'],
    }
  }

  // Stage 2: one LLM call for the gray zone.
  const userContent = buildUserContent(input)
  let verdict: LlmVerdict | null = null
  let provider: ValidityVerdict['provider'] | undefined
  try {
    if (process.env.GEMINI_API_KEY) {
      provider = 'gemini'
      verdict = await callGemini(userContent)
    } else {
      provider = 'anthropic'
      verdict = await callAnthropic(userContent)
    }
  } catch (error) {
    console.error('[Validity] LLM call failed:', error)
  }

  // Provider outage → PENDING, never auto-publish.
  if (!verdict) {
    return {
      status: 'PENDING',
      decidedBy: 'FAILSAFE',
      provider,
      reasons: ['The automated review could not run — queued for manual review.'],
    }
  }

  // Stage 3: decision policy, with trust-score adjustments.
  const status = decideStatus(verdict, input.submitterTrustScore)
  return { status, decidedBy: 'LLM', provider, reasons: verdict.reasons }
}

/**
 * Trust integration:
 * - AUTO_PUBLISH requires confidence ≥ 0.75, or ≥ 0.6 for trusted
 *   submitters (trustScore ≥ 3).
 * - QUEUE decisions from trusted submitters still publish at confidence ≥ 0.8.
 * - Everything else stays PENDING; REJECT is REJECT for everyone.
 */
function decideStatus(verdict: LlmVerdict, trustScore: number): EventStatus {
  if (verdict.decision === 'REJECT') return 'REJECTED'
  if (verdict.decision === 'AUTO_PUBLISH') {
    const threshold = trustScore >= 3 ? 0.6 : 0.75
    if (verdict.confidence >= threshold) return 'APPROVED'
    return 'PENDING'
  }
  // QUEUE
  if (trustScore >= 3 && verdict.confidence >= 0.8) return 'APPROVED'
  return 'PENDING'
}

// ─────────────────────────────────────────────────────────────
// Trust score ledger
// ─────────────────────────────────────────────────────────────

/** Apply a trust-score delta to a user (+1 auto-publish/approve, −2 reject/report). */
export async function applyTrustDelta(userId: string | null | undefined, delta: number) {
  if (!userId) return
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { trustScore: { increment: delta } },
    })
  } catch (error) {
    console.error('[Validity] Failed to apply trust delta:', error)
  }
}
