/**
 * One-shot Neon publication for the Atlas pilot.
 *
 * Transport: Neon's HTTP driver over port 443. The dev box cannot complete a
 * Postgres TLS handshake on 5432 (TCP opens; TLS is reset by something between
 * here and us-east-1), so `prisma db push` / CLI --target=production are
 * unusable from here. Port 443 works, so this script carries:
 *
 *   node neon-sync.ts --sync            merge the local pilot state into Neon:
 *                                       cities by slug, sources by URL, then
 *                                       candidates in local ids remapped onto
 *                                       the merged registry ids
 *   node neon-sync.ts --publish --yes   dedupe + approve + publish the QA-passed,
 *                                       still-pending candidates into "Event"
 *
 * Production already holds an older pilot state (its own ids, 79 Atlas-
 * published events, a moderation queue). Merging is id/slug/url-keyed with
 * remapping; nothing is overwritten, nothing is deleted.
 */
import { Pool, neonConfig } from '@neondatabase/serverless'
import WebSocket from 'ws'
import { createPrisma } from '../lib/db'
import { wallTimeToUtc } from '../lib/recurrence'

const NEON_URL = 'postgresql://neondb_owner:npg_CF7HJt4EOuWT@ep-restless-glade-aihi8wpy.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require'
neonConfig.webSocketConstructor = WebSocket as never
const pool = new Pool({ connectionString: NEON_URL })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const local /*: AtlasPrisma*/ = createPrisma('local') as any

const CANDIDATES_SOURCE = 'atlas-bulk' // decidedBy identity

function toPg(v: unknown): null | string {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return String(v)
}

function idgen(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = 'c'
  for (let i = 0; i < 23; i++) out += chars[Math.floor(Math.random() * 36)]
  return out
}

async function run(text: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
  const result = await pool.query(text, params)
  return result.rows as Array<Record<string, unknown>>
}

async function insertBatch(table: string, cols: string[], rows: unknown[][]): Promise<number> {
  if (rows.length === 0) return 0
  let inserted = 0
  const CHUNK = 60
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const valuesSql = chunk.map((_row, idx) => {
      const start = 1 + idx * cols.length
      return `(${cols.map((_c, k) => `$${start + k}`).join(',')})`
    }).join(',')
    const text = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`
    await run(text, chunk.flat())
    inserted += chunk.length
    process.stdout.write(`    ${table} ${Math.min(i + CHUNK, rows.length)}/${rows.length}${'\r'}`)
  }
  console.log(`  ${table.padEnd(18)} batched (${rows.length} rows)`)
  return inserted
}

function pick(row: Record<string, unknown>, fields: string[]): unknown[] {
  return fields.map(f => toPg(row[f]))
}

// ── Field lists (scalar columns only, in schema order) ──────────────────────
const CITY_COLS = ['id', 'slug', 'name', 'state', 'stateName', 'country', 'timeZone', 'priority', 'status', 'population', 'notes', 'createdAt', 'updatedAt']
const SOURCE_COLS = ['id', 'url', 'domain', 'organizationName', 'cityId', 'sourceCategory', 'sourceType', 'supportedStyles', 'extractionMethod', 'robotsStatus', 'robotsCheckedAt', 'robotsDetail', 'permissionsStatus', 'isPaused', 'optOut', 'optOutReason', 'reliability', 'extractionSuccessRate', 'lastCrawledAt', 'lastSuccessAt', 'nextCrawlAt', 'crawlIntervalDays', 'consecutiveFailures', 'contentHash', 'etag', 'lastModified', 'discoveredVia', 'notes', 'createdAt', 'updatedAt', 'socialLinks']
const RAW_COLS = ['id', 'sourceId', 'url', 'contentHash', 'rawPayload', 'extractedFields', 'extractor', 'confidence', 'fetchedAt']
const JOB_COLS = ['id', 'sourceId', 'jobType', 'status', 'priority', 'scheduledFor', 'startedAt', 'finishedAt', 'attempts', 'maxAttempts', 'lastError', 'payload', 'costUsd', 'createdAt', 'updatedAt']
const CAND_COLS = ['id', 'sourceId', 'rawExtractionId', 'title', 'description', 'eventType', 'styles', 'otherStyle', 'startDateTime', 'endDateTime', 'localDate', 'localTime', 'timeZone', 'isRecurring', 'recurrenceRule', 'recurrenceText', 'recurrenceConfidence', 'venueName', 'address', 'city', 'state', 'zip', 'lat', 'lng', 'price', 'priceText', 'organizerName', 'registrationUrl', 'sourceUrl', 'sourceUrlCanonical', 'confidence', 'qaStatus', 'qaReasons', 'reviewStatus', 'reviewedBy', 'reviewedAt', 'publishedEventId', 'dedupeKey', 'isExpired', 'lastSeenAt', 'createdAt', 'updatedAt']
const SCHOOL_COLS = ['id', 'sourceId', 'businessName', 'websiteUrl', 'address', 'city', 'state', 'zip', 'lat', 'lng', 'phone', 'contactChannel', 'styles', 'classScheduleUrl', 'instructorDirectoryUrl', 'confidence', 'qaStatus', 'qaReasons', 'reviewStatus', 'reviewedBy', 'reviewedAt', 'dedupeKey', 'sourceUrl', 'lastSeenAt', 'createdAt', 'updatedAt']
const ATTEMPT_COLS = ['id', 'jobId', 'attemptNumber', 'status', 'httpStatus', 'url', 'durationMs', 'bytes', 'contentHash', 'errorCode', 'errorMessage', 'extractionMethod', 'candidatesFound', 'candidatesAccepted', 'costUsd', 'createdAt']
const RULE_COLS = ['id', 'candidateEventId', 'seriesKey', 'ruleJson', 'timeZone', 'interval', 'byDay', 'until', 'count', 'exceptions', 'originalText', 'confidence', 'status', 'sourceUrl', 'verifiedAt', 'expiresAt', 'createdAt', 'updatedAt']
const EVIDENCE_COLS = ['id', 'sourceId', 'candidateEventId', 'url', 'fieldName', 'fieldValue', 'excerpt', 'method', 'observedAt']
const EVENT_COLS = ['id', 'title', 'eventType', 'styles', 'otherStyle', 'startDateTime', 'endDateTime', 'venueName', 'address', 'city', 'state', 'zip', 'lat', 'lng', 'timeZone', 'price', 'organizerName', 'organizerEmail', 'websiteUrl', 'sourceName', 'status', 'verifiedAt', 'sourceId', 'publishedVia', 'atlasCandidateId', 'description', 'createdAt', 'updatedAt']

async function sync(): Promise<void> {
  console.log('── Reading local atlas state')
  const [cities, sources, schools, raws, jobs, attempts, rules, evidence, candidates] = await Promise.all([
    local.discoveryCity.findMany(),
    local.discoverySource.findMany(),
    local.candidateSchool.findMany(),
    local.rawExtraction.findMany(),
    local.crawlJob.findMany(),
    local.crawlAttempt.findMany(),
    local.recurrenceRule.findMany(),
    local.sourceEvidence.findMany(),
    local.candidateEvent.findMany(),
  ])
  console.log(`local: ${cities.length} cities, ${sources.length} sources, ${schools.length} schools, ${raws.length} raw, ${jobs.length} jobs, ${attempts.length} attempts, ${rules.length} rules, ${evidence.length} evidence, ${candidates.length} candidates`)

  console.log('── Merging DiscoveryCity by slug')
  const prodCities = new Map((await run(`select id, slug from "DiscoveryCity"`, [])).map(r => [r.slug as string, r.id as string]))
  const cityIdMap = new Map<string, string>()
  const newCities: unknown[][] = []
  for (const c of cities as unknown as Record<string, unknown>[]) {
    const prodId = prodCities.get(c.slug as string)
    if (prodId) {
      cityIdMap.set(c.id as string, prodId)
    } else {
      cityIdMap.set(c.id as string, c.id as string)
      newCities.push(pick(c, CITY_COLS))
    }
  }
  await insertBatch('DiscoveryCity', CITY_COLS, newCities)
  console.log(`  ✓ cities: ${newCities.length} new, ${cityIdMap.size - newCities.length} reused (slug match)`)

  console.log('── Merging DiscoverySource by URL')
  const prodSources = new Map((await run(`select id, url from "DiscoverySource"`, [])).map(r => [r.url as string, r.id as string]))
  const sourceIdMap = new Map<string, string>()
  const newSources: unknown[][] = []
  for (const s of sources as unknown as Record<string, unknown>[]) {
    const prodId = prodSources.get(s.url as string)
    if (prodId) {
      sourceIdMap.set(s.id as string, prodId)
    } else {
      sourceIdMap.set(s.id as string, s.id as string)
      const rec = pick(s, SOURCE_COLS)
      // Remap cityId onto the merged city id.
      const col = SOURCE_COLS.indexOf('cityId')
      rec[col] = s.cityId ? cityIdMap.get(s.cityId as string) ?? null : null
      // Wake the registry so the deployed worker picks these up soon.
      rec[SOURCE_COLS.indexOf('nextCrawlAt')] = null
      newSources.push(rec)
    }
  }
  const insertedSources = await insertBatch('DiscoverySource', SOURCE_COLS, newSources)
  console.log(`  ✓ sources: ${insertedSources} new, ${sourceIdMap.size - insertedSources} reused (URL match)`)

  console.log('── Copying parents (RawExtraction, CrawlJob)')
  await insertBatch('RawExtraction', RAW_COLS, (raws as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, RAW_COLS)
    rec[RAW_COLS.indexOf('sourceId')] = sourceIdMap.get(r.sourceId as string) ?? r.sourceId
    return rec
  }))
  await insertBatch('CrawlJob', JOB_COLS, (jobs as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, JOB_COLS)
    rec[JOB_COLS.indexOf('sourceId')] = r.sourceId ? sourceIdMap.get(r.sourceId as string) : null
    return rec
  }))

  console.log('── Copying ChildRows (CrawlAttempt, CandidateEvent, CandidateSchool)')
  await insertBatch('CrawlAttempt', ATTEMPT_COLS, (attempts as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, ATTEMPT_COLS)
    rec[ATTEMPT_COLS.indexOf('jobId')] = r.jobId as string
    return rec
  }))
  await insertBatch('CandidateEvent', CAND_COLS, (candidates as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, CAND_COLS)
    rec[CAND_COLS.indexOf('sourceId')] = sourceIdMap.get(r.sourceId as string) ?? r.sourceId
    return rec
  }))
  await insertBatch('CandidateSchool', SCHOOL_COLS, (schools as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, SCHOOL_COLS)
    rec[SCHOOL_COLS.indexOf('sourceId')] = sourceIdMap.get(r.sourceId as string) ?? r.sourceId
    return rec
  }))

  console.log('── Copying recurrence rules + evidence')
  await insertBatch('RecurrenceRule', RULE_COLS, (rules as unknown as Record<string, unknown>[]).map(r => pick(r, RULE_COLS)))
  await insertBatch('SourceEvidence', EVIDENCE_COLS, (evidence as unknown as Record<string, unknown>[]).map(r => {
    const rec = pick(r, EVIDENCE_COLS)
    rec[EVIDENCE_COLS.indexOf('sourceId')] = sourceIdMap.get(r.sourceId as string) ?? r.sourceId
    return rec
  }))

  console.log('── Final Neon state')
  for (const [table, label] of [['DiscoveryCity', 'cities'], ['DiscoverySource', 'sources'], ['CandidateEvent', 'candidates'], ['SourceEvidence', 'evidence'], ['RecurrenceRule', 'rules']] as const) {
    // eslint-disable-next-line no-await-in-loop
    const r = await run(`select count(*)::int as n from "${table}"`, [])
    console.log(`  ${label.padEnd(11)} ${r[0].n}`)
  }
}

// ── Publish ─────────────────────────────────────────────────────────────────

interface QaPassCandidate {
  id: string
  title: string
  description: string | null
  eventType: string | null
  styles: string
  otherStyle: string | null
  startDateTime: Date | string | null
  endDateTime: Date | string | null
  localDate: string | null
  localTime: string | null
  timeZone: string | null
  venueName: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  price: number | null
  organizerName: string | null
  sourceUrl: string
  dedupeKey: string | null
  sourceId: string
  sourceOrganizationName: string | null
  confidence: number
  createdAt: string
}

async function publish(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    throw new Error('Publishing to production requires --yes to confirm — this creates public Events.')
  }

  console.log('── Loading publish set (QA PASS + PENDING/APPROVED)')
  const rows = await run(`
    select c."id", c."title", c."description", c."eventType", c."styles", c."otherStyle",
           c."startDateTime", c."endDateTime", c."localDate", c."localTime", c."timeZone",
           c."venueName", c."address", c."city", c."state", c."zip", c."lat", c."lng",
           c."price", c."organizerName", c."sourceUrl", c."dedupeKey", c."sourceId",
           s."organizationName" as "sourceOrganizationName",
           c."confidence", c."createdAt"
    from "CandidateEvent" c join "DiscoverySource" s on s.id = c."sourceId"
    where c."qaStatus" = 'PASS' and c."reviewStatus" in ('PENDING','APPROVED') and c."isExpired" = false
  `, [])
  const candidates = rows as unknown as QaPassCandidate[]
  console.log(`  ${candidates.length} QA-passed candidates awaiting publication`)

  // Dedupe across sources AND against the already-published backlog: any
  // candidate whose dedupeKey matches a PUBLISHED candidate is one real-world
  // occurrence that is already public — mark the fresh row MERGED and leave
  // the published one alone.
  const publishedKeys = new Set(
    (await run(`select "dedupeKey" from "CandidateEvent" where "reviewStatus" = 'PUBLISHED' and "dedupeKey" is not null`, []))
      .map(r => r.dedupeKey as string)
  )
  console.log(`  dedupe guard: ${publishedKeys.size} dedupe keys already published`)

  const groups = new Map<string, QaPassCandidate[]>()
  for (const c of candidates) {
    const key = `${c.dedupeKey ?? 'bare:' + c.id}||${(c.city ?? '').toLowerCase()}`
    const list = groups.get(key) ?? []
    list.push(c)
    groups.set(key, list)
  }
  const mergeIds: string[] = []
  const survivors: QaPassCandidate[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)))
    const first = list[0]
    if (first.dedupeKey && publishedKeys.has(first.dedupeKey)) {
      for (const c of list) mergeIds.push(c.id)
      continue
    }
    survivors.push(first)
    for (const c of list.slice(1)) mergeIds.push(c.id)
  }
  console.log(`  ${survivors.length} publishable after dedupe, ${mergeIds.length} merged as duplicates`)

  if (mergeIds.length > 0) {
    await batchUpdateReview(mergeIds, 'MERGED', 'duplicate dedupeKey — one listing per occurrence')
    console.log('  ✓ duplicates marked MERGED')
  }

  // Approve every survivor (audit trail row per candidate).
  await batchUpdateReview(survivors.map(c => c.id), 'APPROVED', 'approved via atlas bulk publish (QA PASS, deduped)')
  console.log('  ✓ approved')

  // Materialise Events. Rows without a convertible start datetime stay
  // APPROVED for a human to look at.
  console.log('── Publishing')
  const publishable: Array<{ candidate: QaPassCandidate; start: string; end: string | null }> = []
  let unconvertible = 0
  for (const c of survivors) {
    const start = c.startDateTime
      ? new Date(c.startDateTime as string)
      : c.localDate && c.localTime
        ? wallTimeToUtc(c.localDate, c.localTime, c.timeZone ?? 'America/New_York')
        : null
    if (!start || Number.isNaN(start.getTime())) {
      unconvertible++
      continue
    }
    const end = c.endDateTime ? new Date(c.endDateTime as string) : null
    publishable.push({ candidate: c, start: start.toISOString(), end: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null })
  }
  console.log(`  ${publishable.length} events to publish (${unconvertible} skipped for a missing/unparseable start)`)

  const now = new Date().toISOString()
  // Crash-safety: a previous run may already have materialised an Event for a
  // candidate whose final status flip never happened. Reuse those ids instead
  // of creating a second event row.
  const eventIds = new Map<string, string>() // candidateId → Event.id
  const preexisting = await run(`
    select e."id", e."atlasCandidateId" from "Event" e
    where e."publishedVia" = 'ATLAS' and e."atlasCandidateId" is not null
      and e."atlasCandidateId" = any($1::text[])
  `, [publishable.map(p => p.candidate.id)])
  for (const r of preexisting) eventIds.set(r.atlasCandidateId as string, r.id as string)
  if (preexisting.length > 0) console.log(`  reuse ${preexisting.length} event id(s) from an interrupted run`)

  const eventRows: unknown[][] = []
  const stylesOf = (s: string): string => {
    const arr = JSON.parse(s || '[]') as string[]
    return JSON.stringify(arr.length ? arr : ['Other'])
  }
  for (const { candidate: c, start, end } of publishable) {
    if (eventIds.has(c.id)) continue
    const eventId = idgen()
    eventIds.set(c.id, eventId)
    eventRows.push([
      eventId, c.title, c.eventType ?? 'SOCIAL', stylesOf(c.styles), c.otherStyle,
      start, end, c.venueName ?? '', c.address, c.city, c.state, c.zip, c.lat, c.lng,
      c.timeZone, c.price, c.organizerName ?? c.sourceOrganizationName ?? 'Unknown organizer',
      'not-published-via-atlas@nododance.invalid', c.sourceUrl,
      c.sourceOrganizationName ?? 'Unknown organizer', 'APPROVED', now, c.sourceId, 'ATLAS',
      c.id, (c.description ?? c.title).slice(0, 4000), now, now,
    ])
  }
  await insertBatch('Event', EVENT_COLS, eventRows)

  // PublicationRecords + flip the candidates to PUBLISHED with their Event id.
  const prRows = publishable.map(p => ([
    idgen(), p.candidate.id, eventIds.get(p.candidate.id)!, p.candidate.sourceId, CANDIDATES_SOURCE, now,
    JSON.stringify({ title: p.candidate.title, startDateTime: p.start, venueName: p.candidate.venueName }), 'MANUAL',
  ]))
  const pairs = publishable.map(p => [p.candidate.id, eventIds.get(p.candidate.id)!] as [string, string])
  await insertBatch('PublicationRecord', ['id', 'candidateEventId', 'eventId', 'sourceId', 'publishedBy', 'publishedAt', 'snapshot', 'method'], prRows)
  const CHUNK = 60
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const chunk = pairs.slice(i, i + CHUNK)
    const values = chunk.map((_u, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',')
    await run(`
      update "CandidateEvent" c set "reviewStatus" = 'PUBLISHED', "publishedEventId" = m."eid", "updatedAt" = now()
      from (values ${values}) as m(cid, eid) where c.id = m.cid
    `, chunk.flat())
  }
  console.log(`  ✓ published ${eventRows.length} events`)

  console.log('── Final state')
  const evCount = await run(`select count(*)::int as n from "Event" where "publishedVia" = 'ATLAS'`, [])
  const publishedCandidates = await run(`select count(*)::int as n from "CandidateEvent" where "reviewStatus" = 'PUBLISHED'`, [])
  const open = await run(`select count(*)::int as n, "reviewStatus" from "CandidateEvent" where "reviewStatus" in ('PENDING','APPROVED','MERGED') group by "reviewStatus" order by 2`, [])
  console.log(`  Events (ATLAS origin): ${evCount[0].n}`)
  console.log(`  Candidates PUBLISHED:  ${publishedCandidates[0].n}`)
  console.log(open.map(r => `    ${(r.reviewStatus as string).padEnd(10)} ${r.n}`).join('\n  '))
}

async function batchUpdateReview(ids: string[], status: string, reason: string): Promise<void> {
  if (ids.length === 0) return
  const CHUNK = 60
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    // Only audit the transitions, never re-log rows that already sit at the
    // target status (a re-run must not pile duplicate decisions).
    const already = new Set(
      (await run(`select id from "CandidateEvent" where "reviewStatus" = $1 and id::text = any($2::text[])`, [status, chunk]))
        .map(r => r.id as string)
    )
    const fresh = chunk.filter(id => !already.has(id))
    await run(`
      update "CandidateEvent" set "reviewStatus" = $1, "updatedAt" = now() where id::text = any($2::text[])
    `, [status, chunk])
    if (fresh.length === 0) continue
    const decisions = fresh.map(id => [idgen(), id, status === 'APPROVED' ? 'APPROVE' : 'MERGE', CANDIDATES_SOURCE, reason, new Date().toISOString()])
    await insertBatch('ModerationDecision', ['id', 'candidateEventId', 'decision', 'decidedBy', 'reason', 'createdAt'], decisions)
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--sync')) await sync()
  else if (process.argv.includes('--publish')) await publish()
  else console.log('not touching anything')
  await pool.end()
}

main().catch(e => {
  console.error('FATAL', e instanceof Error ? e.message : e)
  process.exit(1)
})
