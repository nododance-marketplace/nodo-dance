# Nodo Atlas — Security and Compliance

> Permissions, enforcement and operator obligations for Nodo Atlas. Last updated: 2026-11-04.

This is the compliance document for the Atlas ingestion engine. It states the rules
the system obeys, the mechanisms that enforce them, the data Atlas is and is not
allowed to collect, and the checks an engineer must run before any production crawl.

It is written against the code, not against a policy intention. Where a rule is
enforced in the database, the enforcement point is named.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| The `atlas/` ingestion engine | The public web app's own data handling, which is covered by `docs/SYSTEM_OVERVIEW.md` |
| `src/app/api/atlas/tick` and `src/app/api/admin/atlas/*` | The LLM sidecar, which is designed but not built |
| `DiscoverySource` permissions, robots enforcement, politeness, opt-out | Payment handling, lesson-request handling, Cloudinary uploads |

---

## 2. Hard rules

These are the rules the system is built around. They are reproduced in
`atlas/README.md` and restated on the `/admin/atlas` Coverage tab.

| # | Rule | Where it is enforced |
|---|---|---|
| 1 | **Never publish without a human decision.** | `CandidateEvent.reviewStatus` must reach `APPROVED` before `PATCH /api/admin/atlas/candidates` will create an `Event` (`src/app/api/admin/atlas/candidates/route.ts:95` returns 400 otherwise). `atlas/cli.ts publish` refuses a candidate that is not `APPROVED` |
| 2 | **Never crawl a path robots.txt disallows.** | `atlas/lib/pipeline.ts:139` returns `SKIPPED_BLOCKED` before the fetch. `atlas/lib/robots.ts` decides. `atlas/lib/sitemap.ts` checks before every sitemap request. `resolveGenericTitles` re-checks before following a link |
| 3 | **Never bypass authentication, CAPTCHAs or access controls.** | No credential storage, no cookie replay, no challenge solving anywhere in `atlas/`. `atlas/lib/fetcher.ts` sends one plain `User-Agent` and no auth headers. A 403 is a failure, recorded as `FAILED` |
| 4 | **Never scrape private groups, private accounts or non-public content.** | `atlas/lib/discovery.ts` excludes `facebook.com`, `instagram.com`, `twitter.com`, `x.com`, `tiktok.com`, `linkedin.com`, `reddit.com`, `meetup.com` and the rest of the `isExcludedDomain` list. The seed sources in `atlas/cli.ts` deliberately contain no social URLs |
| 5 | **Never copy event descriptions or promotional media.** | `atlas/lib/parsers/extract.ts` extracts structured fields. Images are never fetched; `CandidateEvent` has no image column. `CandidateEvent.description` is a truncated excerpt of page text used for reviewer context, and the published `Event.description` falls back to the title |
| 6 | **Never claim partnerships or endorsements.** | `Event.organizerEmail` is hard-coded to `not-published-via-atlas@nododance.invalid` on every Atlas-published record. `Event.sourceName` records the organization name **as published on their own site**, not as a partner |
| 7 | **Never claim to have found every event in a city.** | The `/admin/atlas` Coverage tab reports sources registered, sources fresh and candidates per city. `atlas/lib/discovery.ts` comments: *"Absence of results is never treated as evidence that a city has no dance community"* |

Two more rules that are not in the original list but are enforced in code:

| Rule | Enforcement |
|---|---|
| **Never auto-merge a match.** | `atlas/lib/dedupe.ts` produces `ProposedMatch` rows with a `deterministic` flag; `atlas/lib/pipeline.ts:494` writes every match with `status: 'PROPOSED'` — the expression is literally `m.deterministic ? 'PROPOSED' : 'PROPOSED'`. There is no code path that sets `status: 'CONFIRMED'` |
| **Never publish an unbounded series.** | `atlas/lib/recurrence.ts:231` gives every detected rule an explicit `until` or `count`. `atlas/lib/qa.ts:138` quarantines any recurring claim without one |

---

## 3. The permissions model

### `DiscoverySource.permissionsStatus`

Stored on the source row, set by a human through `/admin/atlas` → Sources tab →
Permissions dropdown. The dropdown offers exactly four values
(`src/components/admin/atlas/atlas-admin.tsx:639-642`).

| Value | Meaning | Effect on crawling |
|---|---|---|
| `UNKNOWN` | Default. Nobody has decided. | Crawled. This is the state of every source created by `registerSource()` |
| `PERMITTED` | The organizer has been identified and permission established, or the site is a partner's own calendar that already lists on nododance.com | Crawled |
| `REVIEW_REQUIRED` | Crawling is allowed but a human must look before publication | Crawled; candidates land in the review queue like any other |
| `DENIED` | The organizer asked us to stop, or we have no basis to crawl | **Never crawled.** `/api/atlas/tick` filters `permissionsStatus: { not: 'DENIED' }`; `atlas/lib/qa.ts:84` adds the hard-reject reason *"Source permissions denied"* |

`DENIED` is a hard reject at two independent layers — the scheduler will not
enqueue the source, and the QA gate would reject any candidate that somehow
arrived from it.

`REVIEW_REQUIRED` is currently the same as `PERMITTED` at the crawl layer. It is a
label for the reviewer, not a crawl gate.

### `optOut` and `optOutReason`

| Field | Type | Meaning |
|---|---|---|
| `optOut` | `Boolean` `@default(false)` | The organizer asked to be removed. **Permanent** |
| `optOutReason` | `String?` | Free-text record of the request, for the audit trail |
| `isPaused` | `Boolean` `@default(false)` | Temporary halt. Operator-controlled, not a request |

Both `atlas/cli.ts crawl` and `/api/atlas/tick` filter `optOut: false` and
`isPaused: false`. Setting `optOut` also sets `isPaused` in the admin API
(`src/app/api/admin/atlas/sources/route.ts:91-94`), so an opt-out also stops the
source immediately.

**Opt-out is permanent.** There is no code path that clears `optOut` — the admin
`PATCH` handler has no `opt-out` action with `optOut: false`; the `opt-out` action
sets `data.optOut = body.optOut !== false`, so `optOut: false` explicitly clears the
flag. The operator has to go to the database to reverse it, which is deliberate
friction. If an opt-out is reversed, the operator must also delete the source's
already-published `Event` rows by hand — Atlas does not cascade.

### `robotsStatus` and `robotsDetail`

| Field | Type | Values |
|---|---|---|
| `robotsStatus` | `String` `@default("UNKNOWN")` | `ALLOWED` \| `DISALLOWED` \| `UNKNOWN` \| `NOT_FETCHED` |
| `robotsCheckedAt` | `DateTime?` | When the verdict was last computed |
| `robotsDetail` | `String?` | The exact matching rule, verbatim |

`robotsDetail` is written by `atlas/lib/pipeline.ts:134` and holds the decision
reason verbatim, for example:

```
disallowed by robots.txt rule "/private/"
allowed by "/public/"
no matching user-agent group
no rule matched
```

This is what makes a robots decision auditable after the fact. The admin Sources
tab shows the badge and the detail string.

`robotsStatus` is only ever written to `ALLOWED` or `DISALLOWED` by the crawler.
`UNKNOWN` and `NOT_FETCHED` are the initial states — a source that has never been
crawled has not been checked, and the system says so rather than implying consent.

---

## 4. robots.txt enforcement

### The gate

`atlas/lib/robots.ts` is the gate. It is consulted in four places, and every one of
them is *before* the fetch:

```
crawlSource()                      → 1. robots gate → SKIPPED_BLOCKED, never fetched
resolveGenericTitles() → isAllowed() → 2. before following a "View Event →" link
SitemapReader.read() → isAllowed()  → 3. before /sitemap.xml and every child map
Fetcher / discovery                 → 4. robots.txt itself is fetched first
```

A blocked path produces:

```typescript
await this.recordAttempt(sourceId, {
  status: 'SKIPPED_BLOCKED',
  url: targetUrl,
  errorCode: 'ROBOTS_DISALLOWED',
  errorMessage: decision.reason,   // e.g. 'disallowed by robots.txt rule "/admin/"'
  durationMs: Date.now() - started,
})
```

and returns immediately with `candidatesFound: 0`. The page is not fetched, not
parsed, and no candidate is created.

### Precedence rules implemented

`RobotsCache.decide()` implements the following, in order:

| Rule | Implementation | Detail |
|---|---|---|
| **Group selection by user-agent** | `agentMatches(groupAgents, ourAgent)` — a group matches if any of its agent tokens is `*` or is a substring of our User-Agent, case-insensitively | Our agent is `NodoAtlasBot/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com) respects-robots.txt` |
| **Most specific group wins** | `specificity` = the longest non-`*` agent token length among matching groups; only groups at that length are `applicable` | A `User-agent: NodoAtlasBot` group beats the `*` group |
| **No matching group → allowed** | `if (matching.length === 0) return { allowed: true, reason: 'no matching user-agent group' }` | RFC 9309 behaviour |
| **Longest matching rule wins** | `if (!best \|\| len > best.len \|\| (len === best.len && rule.type === 'allow'))` | Rule length is the number of characters in the path pattern |
| **Allow wins ties** | The same condition — equal-length `Allow` replaces an equal-length `Disallow` | Google's documented tie-break |
| **Crawl-delay is honoured** | `group.crawlDelay` is parsed to milliseconds and returned as `crawlDelayMs` on the decision | Currently surfaced on the decision object; the fetcher's own 2 s delay is the effective floor |
| **Wildcards and `$` anchor** | `pathMatches()` escapes regex metacharacters, splits on `*` and joins with `.*`, anchors the result at `^` | Supports the `*` wildcard and the `$` end-of-path anchor |
| **Empty `Disallow:` means allow-all** | `pathMatches()` returns `false` for `pattern === ''` | An empty value is not a rule |
| **4xx/5xx robots.txt → no restrictions** | In `load()`, only `res.status === 200` is parsed; anything else yields empty groups | RFC 9309 |
| **Fetch failure → no restrictions** | The `try/catch` around the robots fetch sets `groups = []` | A network failure does not silently block crawling |

### Caching

`RobotsCache` caches per origin in memory for 24 hours (`CACHE_TTL_MS`) and on disk
under `.cache/robots/<origin>.json` for the same 24 hours. The disk cache is
best-effort — a write failure is swallowed — and a corrupt cache file is detected
and refetched.

**Risk to note:** the cache TTL is 24 hours. If a site adds a `Disallow` rule, Atlas
may crawl the newly-disallowed path for up to 24 hours. For a production crawl
against a new source, clear `.cache/robots/` first.

### The User-Agent identifies us

```
NodoAtlasBot/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com) respects-robots.txt
```

It contains a contact address and states that robots.txt is respected. That is the
minimum acceptable form for an automated crawler. It is not randomised and must not
be.

---

## 5. Rate limiting and politeness

### The fetch policy

`atlas/lib/types.ts` defines `DEFAULT_POLICY`, and `atlas/lib/fetcher.ts` enforces it.

| Setting | Value | Enforcement point |
|---|---|---|
| `politenessDelayMs` | `2000` (2 s) | `politeWait()` — minimum gap between two requests to the same hostname |
| Requests in flight per domain | **1** | `withDomainLock()` — a promise chain keyed by hostname. Requests to different domains run concurrently |
| `requestTimeoutMs` | `20000` (20 s) | `AbortController` + `setTimeout` around every `fetch()` |
| `maxBytes` | `5 * 1024 * 1024` (5 MB) | `readCapped()` — the response body is streamed and cancelled the moment it exceeds the cap |
| `maxRetries` | `2` | Declared. **Not implemented** — `fetchInternal` throws on non-2xx and there is no retry loop in the module; backoff happens at the source level instead |
| `userAgent` | Identifiable string (above) | Sent on every request |

```typescript
/** Serialize requests per domain. */
private async withDomainLock<T>(domain: string, fn: () => Promise<T>): Promise<T> {
  const previous = this.domainChain.get(domain) ?? Promise.resolve()
  const next = previous.then(fn, fn)
  this.domainChain.set(domain, next.catch(() => undefined))
  return next
}
```

The `politenessDelayMs` is raised in practice by the CLI:

| Command | Delay |
|---|---|
| `atlas crawl` | `2500` ms |
| `atlas expand` | `2500` ms |
| `atlas discover` | `3000` ms, plus a 2.5 s pause between search queries |
| `DEFAULT_POLICY` | `2000` ms |

### Additional politeness outside the fetcher

| Measure | Where |
|---|---|
| 2.5 s pause between DuckDuckGo queries | `atlas/lib/discovery.ts:174` |
| `robots.txt` fetched before the page, cached for 24 h | `atlas/lib/robots.ts` |
| Conditional requests (`If-None-Match` / `If-Modified-Since`) | `atlas/lib/fetcher.ts` — an unchanged page returns 304 and costs one request with no body |
| SHA-256 content hash for servers that ignore conditional requests | `atlas/lib/pipeline.ts:187` |
| Source re-check interval | `DiscoverySource.crawlIntervalDays`, default `7` days, configurable per source from `/admin/atlas` |
| Exponential backoff on failure | `backoffMs()` — 2ⁿ hours capped at 72 h, incremented on `consecutiveFailures` |
| Global kill switch | `atlas/cli.ts kill-switch` and `POST /api/admin/atlas/overview { action: 'pause-all' }` |

### What is explicitly absent

The `Fetcher` module header states it plainly:

> No proxy rotation, no user-agent spoofing, no CAPTCHA or auth bypass.

There is no IP rotation, no header randomisation, no residential proxy pool, and no
browser-emulation layer anywhere in `atlas/`. The only HTTP client is the global
`fetch` with a fixed header set.

---

## 6. Data minimisation

### What is extracted for an event

`ExtractedEvent` in `atlas/lib/types.ts` is the complete contract. What lands in
`CandidateEvent`:

| Field | Notes |
|---|---|
| `title` | The listing's own title, cleaned |
| `description` | **A truncated excerpt** (≤ 200 characters for HTML tier, ≤ 240 for the weekday-schedule tier) of the surrounding page text, retained so the reviewer can judge the record. Not the organizer's full description |
| `eventType`, `styles`, `otherStyle` | Normalised onto the canonical vocabularies in `src/lib/constants.ts` |
| `localDate`, `localTime`, `localEndTime`, `timeZone` | Wall-clock values as published, plus the IANA zone |
| `isRecurring`, `recurrenceText`, `recurrenceRule`, `recurrenceConfidence` | The original phrase is kept verbatim in `recurrenceText` |
| `venueName`, `address`, `city`, `state`, `zip` | Public location of a public venue |
| `lat`, `lng` | Only if the page carries coordinates |
| `price`, `priceText` | Integer dollars plus the original text |
| `organizerName` | The organization name as published |
| `registrationUrl`, `sourceUrl`, `sourceUrlCanonical` | Links back to the source |
| `foundFields` | Which fields the extractor actually found — drives the confidence score |
| `evidence` | Per-field `(field, value, excerpt, method)` triples, written to `SourceEvidence` |

### What is extracted for a school

`ExtractedSchool` — the only business contact is a **published phone number**:

| Field | Notes |
|---|---|
| `businessName`, `websiteUrl` | |
| `address`, `city`, `state`, `zip` | Public business address |
| `phone` | The phone number printed on the site's own contact page. Stored with the comment `// published business contact only` |
| `contactChannel` | `"phone"` — the channel the organizer publishes, not a private handle |
| `styles` | |
| `classScheduleUrl`, `instructorDirectoryUrl` | Links, for the reviewer |
| `sourceUrl`, `foundFields`, `extractionMethod` | |

`CandidateSchool` has no `contactEmail` column. There is nowhere to put one even if
the extractor wanted to.

### What is extracted for an instructor

`CandidateInstructor` is deliberately thin:

| Field | Notes |
|---|---|
| `displayName` | |
| `sourceUrl` | Where the name was found |
| `styles` | |
| `city`, `state` | |
| `websiteUrl` | |

There is **no** email, no phone, no social handle, no photo, no bio. The model does
not have the columns.

### What is explicitly NOT collected

| Not collected | Why |
|---|---|
| Instructor personal email addresses | `CandidateInstructor` has no email column. `CandidateSchool` has no email column. `InstructorProfile.contactEmail` is populated only by the instructor themselves through the profile editor |
| Instructor personal phone numbers | Same |
| Private or personal contact details of any kind | The only phone captured is a business phone published on the organisation's own site |
| Event images, logos, flyers, promotional media | `CandidateEvent` has no image column. The fetcher does not download binary assets. The `5 MB` cap and the `Accept` header (HTML/XML/JSON) keep binaries out |
| Full event descriptions copied wholesale | Truncated to a short excerpt for reviewer context only |
| Any account credential, session cookie, or API token from a target site | No auth is used against any crawled site |
| Any content behind a login, a paywall, or a `Disallow` rule | Rule 3 and Rule 2 |
| Any content from a private Facebook group, private Instagram account, or Discord/Slack channel | Excluded by `isExcludedDomain()` and by policy |
| User PII of any kind | Atlas reads no user accounts. It writes only to the ingestion tables |

### The published record

An Atlas-published `Event` is assembled in
`src/app/api/admin/atlas/candidates/route.ts:108-136`:

```typescript
organizerEmail: 'not-published-via-atlas@nododance.invalid',
websiteUrl: candidate.sourceUrl,      // the source page, not the org's site
sourceUrl: candidate.sourceUrl,
sourceName: candidate.source.organizationName,
publishedVia: 'ATLAS',
verifiedAt: new Date(),
description: candidate.description ?? candidate.title,
```

`organizerEmail` is a reserved `.invalid` address (RFC 2606) that can never receive
mail. It exists because `Event.organizerEmail` is non-nullable in the schema. This
is the mechanism that prevents an Atlas record from being mistaken for a
partner-endorsed listing or from being contacted as if Nodo were the organiser.

---

## 7. Correction, removal and opt-out

### The request path

```
Organizer emails nododance@gmail.com
        │
        ▼
Operator identifies the DiscoverySource (by domain / url)
        │
        ▼
/admin/atlas → Sources tab → Permissions dropdown → DENIED
   or  PATCH /api/admin/atlas/sources { id, action: 'opt-out', optOut: true }
        │
        ├─ optOut = true           → the source is never crawled again
        ├─ optOutReason = "<text>" → the request is recorded on the row
        └─ isPaused = true         → the source stops immediately
        │
        ▼
Operator deletes the source's already-published Event rows by hand
```

### What each control does

| Control | Type | Permanent? | Effect |
|---|---|---|---|
| `optOut` | Organizer request | **Yes** | Source is never crawled. Never automatically reversed |
| `optOutReason` | Audit trail | Yes | Free text recording who asked and why |
| `isPaused` | Operator control | No | Source stops being crawled. Reversible with `resume` or `resume-all` |
| `permissionsStatus = DENIED` | Operator decision | No, but semantically strong | Source is not scheduled and its candidates are hard-rejected by QA |
| `permissionsStatus = REVIEW_REQUIRED` | Operator decision | No | Label for the reviewer |
| Global kill switch | Operator control | No | Every source paused at once |

### Removal of already-published records

Removing a source is **not** the same as removing what it published. A source that
published three events and then opts out leaves those three `Event` rows in place.
Atlas has no cascade from `DiscoverySource` to `Event` — `Event.sourceId` is a plain
nullable string, not a foreign key, precisely so that deleting a source row never
deletes published data. Removal of published listings is a manual operator action
through `DELETE /api/admin/events`, and it must be done source-by-source.

**This is a real operational gap.** The honest statement is: *opt-out stops future
collection; it does not retract what was already published.* An operator who honours
an opt-out request must also find and delete the affected listings. There is no
tooling for "list all events from source X" beyond a direct query, and no
`sourceId` index-driven admin view.

### The published-listing obligation

`Event.publishedVia = 'ATLAS'` marks every scraped listing. `Event.sourceUrl` points
at the page it came from. `Event.verifiedAt` records when a human last confirmed it.
`PublicationRecord.snapshot` stores the exact field values that were published at
that moment, so a later correction can be diffed against what went out.

The rule that a listing must be re-confirmed is encoded in
`RecurrenceRule.expiresAt` (a detected series expires; the default is 180 days if no
`until` was found) and in `CandidateEvent.isExpired`.

---

## 8. Provenance and attribution

| Mechanism | Where | What it records |
|---|---|---|
| `SourceEvidence` | One row per extracted field | `sourceId`, `candidateEventId`, `url`, `fieldName`, `fieldValue`, `excerpt`, `method` (`JSONLD` \| `RSS` \| `ICAL` \| `HTML` \| `LLM`), `observedAt` |
| `Event.sourceId` | Published event | The `DiscoverySource.id` it came from |
| `Event.sourceUrl` | Published event | The original event page |
| `Event.sourceName` | Published event | The organization name as published on their own site |
| `Event.verifiedAt` | Published event | When a human last confirmed the record |
| `Event.publishedVia` | Published event | `ORGANIZER` \| `ATLAS` \| `MANUAL` |
| `Event.atlasCandidateId` | Published event | The `CandidateEvent` row it was created from |
| `PublicationRecord` | One row per publication | `candidateEventId`, `eventId`, `sourceId`, `publishedBy`, `publishedAt`, `method`, `snapshot` (JSON of the published fields) |
| `RawExtraction` | One row per fetch | `sourceId`, `url`, `contentHash`, `rawPayload` (the extracted structure, capped at 200 KB), `extractedFields`, `extractor`, `confidence`, `fetchedAt` |
| `CrawlAttempt` | One row per attempt | `status` (`SUCCESS` \| `FAILED` \| `SKIPPED_BLOCKED` \| `SKIPPED_UNCHANGED`), `httpStatus`, `url`, `durationMs`, `bytes`, `contentHash`, `errorCode`, `errorMessage`, `extractionMethod`, `candidatesFound`, `candidatesAccepted`, `costUsd` |
| `EntityMatch` | One row per proposed match | `matchType`, `score`, `status`, `reason` — the reason is a human-readable sentence explaining why the match was proposed |

`SourceEvidence` is the mechanism that makes "never invent a field" checkable. A
reviewer can see, for one field of one candidate, where the value came from and how
it was obtained.

**Caveat to be honest about:** `SourceEvidence` rows are only written for the
JSON-LD tier. `buildEvidence()` in `atlas/lib/parsers/extract.ts:205` is the only
producer, and it is only called from `fromJsonLd()`. RSS, iCal and HTML candidates
have `foundFields` but no per-field evidence rows. `CandidateEvent.sourceUrl` and
`RawExtraction.rawPayload` are the fallback provenance for those tiers.

---

## 9. Secret handling

| Secret | Where it is used | Required for | Handling |
|---|---|---|---|
| `CRON_SECRET` | `src/app/api/atlas/tick/route.ts` | The scheduler | Vercel sends `Authorization: Bearer $CRON_SECRET`. The endpoint returns **503** if the variable is unset and **401** if the header does not match. It cannot be triggered from the public internet |
| `SERPER_API_KEY` | `atlas/lib/discovery.ts` | Paid keyword discovery | Optional. Without it, discovery falls back to the DuckDuckGo HTML endpoint, which is bot-challenged from this IP. Sent as `X-API-KEY` to `https://google.serper.dev/search` |
| `ADMIN_EMAILS` | `src/lib/auth.ts` | All admin surfaces | Comma-separated list. Compared by exact string match. **Not a secret** — it is a configuration list, and anyone on it has full admin |
| `NEXTAUTH_SECRET` | `src/lib/auth.ts` | Sessions | 32+ random characters |
| `DATABASE_URL` / `DIRECT_URL` | Prisma | Everything | Pooled and direct Neon connection strings |
| `ATLAS_DATABASE_URL` | `atlas/prisma/.env` | The Atlas worker | `file:./atlas.db` — a local SQLite file. **Never point this at production** |
| `ATLAS_MODE` | `/api/atlas/tick` | Worker mode | `enqueue` (default) or `inline` |
| `ATLAS_MAX_SOURCES` | `/api/atlas/tick` | Batch size | Default `10`, hard-capped at `50` |
| Nominatim User-Agent | `src/lib/geocode.ts` | Geocoding | A string identifying the app. Not a credential, but it is the thing Nominatim's usage policy asks us to keep current and contactable |

### Rules

- **No secret is ever written to the database.** There is no column that stores an
  API key.
- **No secret is ever logged.** `src/lib/auth.ts` logs `NEXTAUTH_URL` and the
  resolved auth URL at cold start — deliberately, and neither is a secret. The
  `.hallmark` scripts redact Postgres URLs from their error output with
  `.replace(/postgres(?:ql)?:\/\/[^\s]+/g, '[redacted]')`.
- **No secret is committed.** `.env` and `atlas/prisma/.env` are gitignored.
- **The Atlas worker needs no secret at all** to crawl. It needs a database URL and
  nothing else. The `CRON_SECRET` belongs to the scheduler endpoint, which runs in
  the web app.

### Currently unset

`.env` contains: `ADMIN_EMAILS`, `DATABASE_URL`, `DIRECT_URL`, `EMAIL_FROM`,
`EMAIL_SERVER_HOST`, `EMAIL_SERVER_PASSWORD`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CITY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

Not present, and not in `.env.example`: **`CRON_SECRET`**, `SERPER_API_KEY`,
`ATLAS_MODE`, `ATLAS_MAX_SOURCES`, `CLOUDINARY_*`, `GOOGLE_CLIENT_*`,
`EVENT_RATE_LIMIT_ENABLED`.

Consequence: with `CRON_SECRET` unset, `/api/atlas/tick` returns 503 and the
scheduler is inert. The Vercel cron entry exists but does nothing.

---

## 10. Database boundaries

```
┌──────────────────────────────────────────────────────────────┐
│  PILOT (current)                                            │
│                                                              │
│  atlas/cli.ts  ──►  atlas/prisma/atlas.db   (SQLite)        │
│                        ATLAS_DATABASE_URL="file:./atlas.db" │
│                        66 sources · 150 candidates · 0 published
└──────────────────────────────────────────────────────────────┘
        ✗ no path from the pilot to production

┌──────────────────────────────────────────────────────────────┐
│  PRODUCTION (not yet connected)                             │
│                                                              │
│  Vercel web app  ──►  Neon Postgres  ◄──  Atlas worker      │
│  (DATABASE_URL)               (DIRECT_URL)  (to be scoped)   │
└──────────────────────────────────────────────────────────────┘
```

### The requirement

**The production Neon database must not receive the worker's credentials.**

If the worker connects with the same `DATABASE_URL` the web app uses, a bug in the
worker can delete published events, or the worker can be turned into a write
amplifier against a production table. Atlas writes `Event` rows through
`prisma.event.create()` — a real write to the production table.

### Recommended scoping

| Option | How | Trade-off |
|---|---|---|
| **A Neon branch** (recommended) | Point the worker's `DATABASE_URL` at a Neon branch of the same database, and merge deliberately | Branches have their own connection string and their own copy of the data. Safe to blow away and recreate. Neon free tier allows branches |
| **A restricted Postgres role** | `CREATE ROLE atlas_worker LOGIN PASSWORD '…'; GRANT SELECT, INSERT, UPDATE ON "DiscoverySource", "CrawlJob", "CrawlAttempt", "RawExtraction", "CandidateEvent", "CandidateSchool", "CandidateVenue", "CandidateInstructor", "RecurrenceRule", "SourceEvidence", "EntityMatch", "ModerationDecision", "PublicationRecord", "SourceHealth" TO atlas_worker;` — and deliberately **not** `Event` | The worker would then be unable to publish at all. Publishing would move to a separate, human-triggered step run with the web app's credentials. This is the strongest separation |
| **Neither** | Keep the worker on SQLite and review/publish by hand, as the pilot does today | Zero production risk. Also zero automation. The current state of the project |

### Rules for the production rollout

1. The worker must use a **different** connection string from the web app, or a
   role with fewer grants.
2. `Event` writes from the worker are only permitted if the reviewer has approved
   the candidate. A restricted role that cannot write `Event` makes this structural
   rather than procedural.
3. The schema push is a separate, human-approved operation. `npx prisma db push`
   against Neon requires `DIRECT_URL` and explicit approval
   (`atlas/README.md`, open item 3).
4. The `atlas/prisma/schema.local.prisma` SQLite copy and its generated client stay
   local. `atlas/generated/` is gitignored.
5. `ATLAS_TARGET=production` is referenced in the `atlas/cli.ts` header comment as
   the flag that would point the CLI at production, together with an
   `--i-know-this-is-production` confirmation. **Neither is implemented.** The CLI
   always uses the local SQLite client. Treat any mention of a production flag as
   documentation of intent, not a feature.

---

## 11. Pre-flight checklist

Run this before any production crawl. Every line is a check an engineer can
actually execute.

### Configuration

| # | Check | Command / evidence | Pass | Fail |
|---|---|---|---|---|
| 1 | `CRON_SECRET` is set and is not a placeholder | `echo $CRON_SECRET \| wc -c` — expect ≥ 32 chars | ☐ | ☐ |
| 2 | `/api/atlas/tick` refuses an unauthenticated call | `curl -i <host>/api/atlas/tick` — expect `401` | ☐ | ☐ |
| 3 | `/api/admin/atlas/sources` refuses a non-admin session | `curl -i <host>/api/admin/atlas/sources` — expect `401` | ☐ | ☐ |
| 4 | `ADMIN_EMAILS` contains only addresses you control | Review the env var | ☐ | ☐ |
| 5 | The worker's database URL is **not** the web app's `DATABASE_URL` | Compare the two strings | ☐ | ☐ |
| 6 | The worker's role cannot delete from `Event` | `SELECT` the role's grants | ☐ | ☐ |
| 7 | `ATLAS_MODE=enqueue` and the queue is drained by a separate runner | Inspect the env var | ☐ | ☐ |
| 8 | `ATLAS_MAX_SOURCES` is small for the first run | Default is `10` | ☐ | ☐ |
| 9 | The `.cache/robots/` directory is empty before the first run | `ls .cache/robots` | ☐ | ☐ |

### Permissions

| # | Check | Pass | Fail |
|---|---|---|---|
| 10 | Every source in the registry has `permissionsStatus` set deliberately — no `UNKNOWN` rows are being crawled by accident | ☐ | ☐ |
| 11 | Every source has a named owner in `notes` | ☐ | ☐ |
| 12 | No source in the registry is on the excluded-platform list | ☐ | ☐ |
| 13 | Every `DISALLOWED` source has a `robotsDetail` that quotes the rule | ☐ | ☐ |

### Politeness

| # | Check | Pass | Fail |
|---|---|---|---|
| 14 | The `User-Agent` is the real `NodoAtlasBot/1.0` string and has not been randomised | ☐ | ☐ |
| 15 | The politeness delay is ≥ 2000 ms | ☐ | ☐ |
| 16 | `crawlIntervalDays` is set per source, not left at the default of 7 for a site that changes hourly | ☐ | ☐ |
| 17 | The kill switch has been tested: `atlas kill-switch` pauses everything, `--off` resumes | ☐ | ☐ |

### Data handling

| # | Check | Pass | Fail |
|---|---|---|---|
| 18 | No `CandidateEvent` row contains a personal email address | ☐ | ☐ |
| 19 | No `CandidateSchool` row contains an email address | ☐ | ☐ |
| 20 | No `CandidateInstructor` row contains contact details | ☐ | ☐ |
| 21 | No image or binary URL was downloaded into the candidate store | ☐ | ☐ |
| 22 | Every published `Event` has `publishedVia = 'ATLAS'`, a `sourceUrl`, a `sourceName` and a `verifiedAt` | ☐ | ☐ |
| 23 | Every published `Event` has `organizerEmail = 'not-published-via-atlas@nododance.invalid'` | ☐ | ☐ |
| 24 | `PublicationRecord.snapshot` exists for every published record | ☐ | ☐ |
| 25 | No public page claims Nodo is partnered with, or endorsed by, any listed organisation | ☐ | ☐ |

### Rollout control

| # | Check | Pass | Fail |
|---|---|---|---|
| 26 | `npx tsx atlas/scripts/test.ts` exits 0 | ☐ | ☐ |
| 27 | The pilot was run on SQLite and the candidate counts reviewed | ☐ | ☐ |
| 28 | A named operator owns the opt-out inbox for the duration of the crawl | ☐ | ☐ |
| 29 | The `docs/atlas/ATLAS-TESTING.md` acceptance table has been filled in | ☐ | ☐ |
| 30 | A rollback plan exists: how the new columns and tables are removed from Neon | ☐ | ☐ |

---

## 12. Known limitations and residual risks

Stated plainly, because a compliance document that claims no risk is not a compliance
document.

### Compliance risks

| # | Risk | Severity | Current state |
|---|---|---|---|
| 1 | **robots.txt is a floor, not a contract.** A site may publish an event page and still not want it redistributed. Atlas has no way to know that beyond `permissionsStatus` | Medium | Mitigated by requiring a human decision before publication, and by the organiser-facing opt-out path |
| 2 | **Opt-out does not retract published records.** Removing a source stops future crawling but leaves published listings live | **High** | Unmitigated. Requires a manual operator step that has no tooling behind it. This is the single biggest gap in the compliance story |
| 3 | **The default `permissionsStatus` is `UNKNOWN`, and `UNKNOWN` sources are crawled.** A source added by `atlas discover` is crawled before a human has looked at it | Medium | The candidate never publishes without a decision, so the exposure is limited to requests, not to published data |
| 4 | **The robots cache is 24 hours.** A newly added `Disallow` rule can be ignored for up to a day | Low | Clear `.cache/robots/` before a production run |
| 5 | **`robotsStatus` records `ALLOWED` even when no robots.txt existed.** A site with no robots.txt is treated as unrestricted, which is RFC-correct but means "ALLOWED" can mean "we found nothing to obey" | Low | `robotsDetail` records the reason (`no matching user-agent group`) |
| 6 | **The `Crawl-delay` value is parsed but not applied to the request schedule.** The decision object carries `crawlDelayMs`, but `Fetcher` uses its own fixed 2 s delay | Medium | If a site publishes `Crawl-delay: 30`, Atlas does not honour it. This should be fixed before crawling any site that sets it |

### Data-handling risks

| # | Risk | Severity | Current state |
|---|---|---|---|
| 7 | **`CandidateEvent.description` holds an excerpt of the source's copy.** It is capped at 200–240 characters, but it is still the organiser's text | Low | Truncation limits it. The published `Event.description` falls back to the title when the candidate has none |
| 8 | **Published `Event.description` is set to the candidate description when present**, i.e. up to 200 characters of someone else's copy | Medium | The requirement is "extract facts, link back". A stricter publish path would set `Event.description` to the title plus a link, and keep the excerpt only in the candidate record |
| 9 | **`SourceEvidence` is only produced by the JSON-LD tier.** RSS, iCal and HTML candidates have no per-field evidence | Medium | `RawExtraction.rawPayload` and `CandidateEvent.sourceUrl` are the fallback |
| 10 | **`CrawlAttempt.rawPayload` is not stored, but `RawExtraction.rawPayload` holds the full extracted structure for every fetch** | Low | It is capped at 200 KB. It is deleted with the source via `onDelete: Cascade` |

### Operational risks

| # | Risk | Severity | Current state |
|---|---|---|---|
| 11 | **Admin authority is an environment variable.** A typo in `ADMIN_EMAILS` grants full admin to a stranger; a missing entry locks the operator out | Medium | Every admin route re-checks on each request, so there is no stale session issue |
| 12 | **There is no `middleware.ts`.** A new route is unprotected until someone adds a guard | Medium | The Atlas routes have guards. The pattern is convention, not enforcement |
| 13 | **The crawler has no circuit breaker at the domain level.** A misbehaving site can be re-requested at every scheduled interval | Low | 20 s timeout, 5 MB cap, 2 s delay, exponential backoff on failure |
| 14 | **`maxRetries: 2` is declared in the policy but not implemented in the fetcher.** Failures propagate to the source-level backoff | Low | Behaviour is still safe — failures are recorded and retried on the next scheduled run |
| 15 | **The Nominatim geocoder has no cache, no rate limit and no timeout.** It is called from the submit route and the admin actions | Medium | Not a crawler-facing risk — Atlas does not call it — but it can stall a Vercel function |
| 16 | **The free search endpoint is bot-challenged from this IP.** Every free provider tried is challenged | Medium | Sitemaps carry discovery without a search engine. `SERPER_API_KEY` is the answer |
| 17 | **The schema has not been pushed to Neon.** The production database does not have the Atlas tables, so `/api/admin/atlas/*` and `/api/atlas/tick` will throw at runtime in production | **High** | Requires explicit approval and `npx prisma db push`. This is the first thing that must happen before any of the above matters |

---

## 13. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-ARCHITECTURE.md` | System shape, extraction ladder, deployment topology |
| `ATLAS-REPO-AUDIT.md` | What the repository contains today, and what Atlas changed |
| `ATLAS-TESTING.md` | Test strategy and acceptance criteria |
| `atlas/README.md` | Developer quick reference and the hard rules list |
