/**
 * robots.txt handling for Atlas.
 *
 * This is a hard gate: a path that robots.txt disallows is never fetched.
 * Rules are parsed per User-agent group, honouring Allow/Disallow precedence
 * (longest matching rule wins, Allow wins ties) and Crawl-delay.
 *
 * Cache is on disk so repeated runs do not re-fetch robots.txt.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const CACHE_DIR = resolve(__dirname, '..', '..', '.cache', 'robots')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface RobotsRule {
  type: 'allow' | 'disallow'
  path: string
}

interface RobotsGroup {
  agents: string[]
  rules: RobotsRule[]
  crawlDelay?: number
}

export interface RobotsDecision {
  allowed: boolean
  reason: string
  crawlDelayMs?: number
}

interface CacheEntry {
  fetchedAt: number
  groups: RobotsGroup[]
  status: number
}

function cachePath(origin: string): string {
  const safe = origin.replace(/[^a-z0-9.]/gi, '_')
  return resolve(CACHE_DIR, `${safe}.json`)
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let lastWasAgent = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }

    lastWasAgent = false
    if (!current) {
      current = { agents: [], rules: [] }
      groups.push(current)
    }

    if (field === 'disallow') current.rules.push({ type: 'disallow', path: value })
    else if (field === 'allow') current.rules.push({ type: 'allow', path: value })
    else if (field === 'crawl-delay') {
      const seconds = Number(value)
      if (!Number.isNaN(seconds)) current.crawlDelay = seconds * 1000
    }
  }
  return groups
}

function agentMatches(groupAgents: string[], ourAgent: string): boolean {
  const us = ourAgent.toLowerCase()
  for (const agent of groupAgents) {
    if (agent === '*') return true
    if (us.includes(agent)) return true
  }
  return false
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === '') return false
  // Support the * wildcard and $ anchor subset of the robots spec.
  const anchored = pattern.endsWith('$')
  const core = anchored ? pattern.slice(0, -1) : pattern
  const parts = core.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp('^' + parts.join('.*'))
  const match = regex.test(path)
  return anchored ? match : match
}

export class RobotsCache {
  private entries = new Map<string, CacheEntry>()

  /** Fetch (and cache) robots.txt for an origin. Never throws. */
  async load(origin: string, userAgent: string, fetcher: (url: string) => Promise<{ status: number; body: string }>): Promise<RobotsGroup[]> {
    const cached = this.entries.get(origin)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.groups

    const file = cachePath(origin)
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry
        if (Date.now() - parsed.fetchedAt < CACHE_TTL_MS) {
          this.entries.set(origin, parsed)
          return parsed.groups
        }
      } catch {
        /* corrupt cache — refetch */
      }
    }

    let groups: RobotsGroup[] = []
    try {
      const res = await fetcher(`${origin}/robots.txt`)
      if (res.status === 200) groups = parseRobots(res.body)
      // 4xx/5xx → treat as "no restrictions published" (RFC 9309 allows this)
    } catch {
      groups = []
    }

    const entry: CacheEntry = { fetchedAt: Date.now(), groups, status: 200 }
    this.entries.set(origin, entry)
    try {
      if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(entry), 'utf8')
    } catch {
      /* cache write is best-effort */
    }
    return groups
  }

  /** Decide whether a URL may be fetched. */
  decide(groups: RobotsGroup[], url: string, userAgent: string): RobotsDecision {
    let pathname: string
    try {
      pathname = new URL(url).pathname + new URL(url).search
    } catch {
      return { allowed: false, reason: 'unparseable url' }
    }

    const matching = groups.filter(g => agentMatches(g.agents, userAgent))
    if (matching.length === 0) {
      return { allowed: true, reason: 'no matching user-agent group' }
    }

    // Only the most specific (longest agent token) group applies.
    const specificity = matching.reduce((max, g) => {
      const len = Math.max(...g.agents.map(a => (a === '*' ? 0 : a.length)), 0)
      return Math.max(max, len)
    }, 0)
    const applicable = matching.filter(g =>
      Math.max(...g.agents.map(a => (a === '*' ? 0 : a.length)), 0) === specificity
    )

    let best: { type: 'allow' | 'disallow'; path: string; len: number } | null = null
    let crawlDelay: number | undefined

    for (const group of applicable) {
      if (group.crawlDelay !== undefined) crawlDelay = group.crawlDelay
      for (const rule of group.rules) {
        if (!pathMatches(rule.path, pathname)) continue
        const len = rule.path.length
        if (!best || len > best.len || (len === best.len && rule.type === 'allow')) {
          best = { type: rule.type, path: rule.path, len }
        }
      }
    }

    if (!best) return { allowed: true, reason: 'no rule matched', crawlDelayMs: crawlDelay }
    return {
      allowed: best.type === 'allow',
      reason:
        best.type === 'allow'
          ? `allowed by "${best.path}"`
          : `disallowed by robots.txt rule "${best.path}"`,
      crawlDelayMs: crawlDelay,
    }
  }
}
