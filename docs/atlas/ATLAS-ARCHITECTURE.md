# Nodo Atlas — System Architecture

> **Mission: map the dance world. Keep it connected.**
> Status: proof of concept complete (Charlotte pilot). Production migration requires explicit approval.
> Last updated: 2026-11-04. Owners: Nodo Dance engineering.

---

## 1. What Atlas is

Nodo Atlas is the ingestion engine behind nododance.com. It continuously discovers
publicly advertised dance events, schools, studios, instructors and venues across
the United States, extracts them into structured records, verifies their quality,
deduplicates them against what Nodo already knows, and places them in a human review
queue.

It is **not** a bulk scraper. Every part of the system is built around one rule:

```
Raw source data  →  Extracted candidate  →  Validated candidate  →  Approved publication
```

A record only becomes a public listing after a human decision, and every published
record is traceable to the page it came from.

### The problem it solves

The founder currently spends hours a week manually copying event details into forms.
Atlas replaces that with a maintenance system: a source is registered once, then
re-checked on a schedule appropriate to how often it changes. The founder's time moves
from data entry to partnerships and product.

### The honest limitation

Atlas measures **source coverage**, not event coverage. It never claims to have found
every event in a city — absence of results is a gap in the query set, not proof that a
community does not exist. The coverage report in `/admin/atlas` reports sources
registered, sources fresh, and candidates verified per city.

---

## 2. System shape

```
                         ┌──────────────────────────────────────────────┐
                         │        NODO WEB APP  (Next.js 16)            │
                         │  nododance.com  ·  Vercel  ·  Neon Postgres   │
                         │                                              │
   Organizers ──────────▶│  /submit-event  /become-an-instructor       │
                         │  /events  /instructors  (public, APPROVED)   │
                         │                                              │
                         │  /admin  →  /admin/atlas                      │
                         │      • review queue  • source registry       │
                         │      • coverage  • kill switch               │
                         └───────▲──────────────────────┬───────────────┘
                                 │ read / write         │ enqueue jobs
                                 │                      │ (CrawlJob rows)
   ┌─────────────────────────────┴──────────────────────▼───────────────┐
   │                    ATLAS INGESTION WORKER                         │
   │                    (Node/TypeScript, same repo)                   │
   │                                                                   │
   │  ┌────────────┐   ┌───────────┐   ┌────────────┐   ┌───────────┐  │
   │  │ A Discovery│   │ B Source  │   │ C Extract  │   │ D Recurr. │  │
   │  │   cities & │──▶│  Registry │──▶│  (ladder)  │──▶│ Intellig. │  │
   │  │   sources  │   │           │   │            │   │           │  │
   │  └────────────┘   └───────────┘   └────────────┘   └───────────┘  │
   │                                          │                │        │
   │                                          ▼                ▼        │
   │                                   ┌────────────┐   ┌────────────┐  │
   │                                   │ E Entity   │   │ F Quality  │  │
   │                                   │ Resolution │◀──│ Assurance  │  │
   │                                   └────────────┘   └────────────┘  │
   │                                          │                │        │
   │                                          ▼                ▼        │
   │                                   ┌────────────────────────────┐   │
   │                                   │ G Synchronisation          │   │
   │                                   │  (schedule + re-check)     │   │
   │                                   └────────────────────────────┘   │
   │                                          │                        │
   │   Optional: LLM sidecar ────────────────┘ (long tail only)       │
   │   (Python · ScrapeGraphAI · schema-driven · 5% of pages)         │
   └───────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────────┐
                    │  INGESTION SCHEMA (Prisma)   │
                    │  DiscoveryCity               │
                    │  DiscoverySource             │
                    │  CrawlJob / CrawlAttempt     │
                    │  RawExtraction               │
                    │  CandidateEvent/School/Venue │
                    │  CandidateInstructor         │
                    │  RecurrenceRule              │
                    │  SourceEvidence              │
                    │  EntityMatch                 │
                    │  ModerationDecision          │
                    │  PublicationRecord           │
                    │  SourceHealth                │
                    └──────────────────────────────┘
```

### Why the worker lives in the same repo

The worker is Node/TypeScript and shares the Prisma schema, the timezone utilities
and the style constants with the web app. That removes the second-language tax: one
test suite, one type system, one migration story, one deploy of the app. The Python
LLM sidecar is isolated behind an HTTP contract precisely so it stays optional.

---

## 3. The extraction ladder

Every page is attempted in the cheapest order that can produce a usable record.
The ladder is not a preference — it is a cost control. If tier 1 succeeds, no
tier 2+ ever runs.

| Tier | Method | Cost/page | Used for |
|---|---|---|---|
| 0 | RSS / Atom feed | $0.00 | Schedules published as a feed |
| 1 | JSON-LD (`schema.org/Event`) | $0.00 | Typed, authoritative event data |
| 2 | iCalendar (`.ics`) | $0.00 | Recurring series with RRULE |
| 3 | Deterministic HTML scan | $0.00 | Date-anchored listing blocks |
| 4 | Small LLM classification | ~$0.04/1k | Style/type judgement on short snippets |
| 5 | LLM structured extraction | $0.45–$2.24/1k | Heterogeneous pages that defeat tiers 1–3 |
| 6 | Managed anti-bot browser | $5–25/1k | JS-rendered, 403, challenge pages |

The Charlotte pilot produced **95 candidates at $0 total cost** because tiers 0–3
covered every page the pilot visited. Tiers 5–6 exist for the long tail and are the
only place where ScrapeGraphAI earns its cost (see `ATLAS-SCRAPEGRAPHAI-EVAL.md`).

### The LLM sidecar (tier 5)

Tiers 5 and 6 live behind an HTTP contract, in a separate Python process:

```
atlas worker (Node)  ──POST /extract──▶  sidecar (Python · ScrapeGraphAI)
                    ◀──{ok, data, costUsd}──
```

Why a sidecar rather than a library call:

- Playwright, LangChain and the Python runtime stay out of the main worker.
- ScrapeGraphAI can be swapped for Crawl4AI, Firecrawl or a direct model call
  without touching the pipeline.
- The sidecar needs Python **3.12+** (ScrapeGraphAI 2.x requirement), which is
  not a dependency the main worker should take on.

The gate before spending money is in `atlas/lib/llm-gate.ts`: a page qualifies
only when it carries **both** listing language (event, calendar, schedule, class)
**and** dance language, and only when the deterministic pass found nothing on it.
A failed or empty LLM response produces **no candidate** — the page is simply
skipped, which is the correct outcome.

The sidecar's contract is tested without any API key by
`npx tsx atlas/scripts/test-sidecar.ts` (23 assertions), which exercises the
success path, the failure path, an unreachable sidecar and the gate itself.

**An LLM-extracted candidate faces exactly the same QA, dedupe and review rules
as a JSON-LD one. There is no trusted path.**

---

## 4. Data flow of a single crawl

```
source (DiscoverySource)
  │
  ├─ 1. robots.txt gate ──────────────► DISALLOWED? → record attempt, stop. Never fetch.
  │
  ├─ 2. conditional GET (ETag / Last-Modified)
  │        └─ 304 / unchanged hash ─────► mark fresh, reschedule, stop. Costs nothing.
  │
  ├─ 3. extraction ladder (tier 0 → 3)
  │        └─ generic title ("View Event →")? → follow the link, re-extract from the detail page
  │
  ├─ 4. normalisation
  │        style → canonical DANCE_STYLES · event type → canonical EVENT_TYPES
  │        price → integer or null · address → normalised for matching
  │
  ├─ 5. recurrence intelligence
  │        "every Wednesday at 8pm" → FREQ=WEEKLY;BYDAY=WE;UNTIL=<bounded horizon>
  │        occurrences computed in LOCAL wall time → UTC (DST-correct)
  │
  ├─ 6. quality assurance
  │        PASS · QUARANTINE · REJECT — with explicit human-readable reasons
  │
  ├─ 7. entity resolution
  │        deterministic rules decide · fuzzy rules only PROPOSE a match
  │
  └─ 8. persist (idempotent upsert on sourceId + dedupeKey)
           └─ CandidateEvent + SourceEvidence + RecurrenceRule + EntityMatch
                  │
                  ▼
           /admin/atlas review queue → human decision → Event (publishedVia: ATLAS)
```

---

## 5. Agent responsibilities

| Agent | Responsibility | Where it lives |
|---|---|---|
| **A — City Discovery** | Build a prioritised inventory of metro areas; find candidate source sites | `atlas/lib/discovery.ts` |
| **B — Source Registry** | Remember every source: URL, city, styles, permissions, robots verdict, last crawl, next crawl | `DiscoverySource` |
| **C — Extraction** | Pull structured fields from a page using the ladder; never invent a field | `atlas/lib/parsers/` |
| **D — Recurrence Intelligence** | Detect series, bound them, compute occurrences in local time | `atlas/lib/recurrence.ts` |
| **E — Entity Resolution** | Match candidates against published events and each other | `atlas/lib/dedupe.ts` |
| **F — Quality Assurance** | Validate, score confidence, quarantine what is uncertain | `atlas/lib/qa.ts` |
| **G — Synchronisation** | Re-check sources on their own schedule; detect change, cancellation, staleness | `atlas/lib/pipeline.ts` + `/api/atlas/tick` |
| **H — Geographic Coverage** | Report sources, freshness, duplicates, verified listings per city | `/admin/atlas` coverage tab |

---

## 6. Scheduling and re-check policy

Initial policies, configurable per source:

| Source type | Re-check interval | Rationale |
|---|---|---|
| Active weekly class calendar | 3–7 days | Changes weekly |
| Frequently changing event list | 1–3 days | Changes often |
| One-time upcoming event | Until its start time, then stop | No reason to keep checking |
| School business details | 30 days | Rarely changes |
| Inactive source | Progressive backoff (2^n hours, capped at 72h) | Stop wasting requests |
| Explicitly opted-out source | Never | Honour the request permanently |

Change detection is two-layered: an HTTP `ETag`/`Last-Modified` conditional request
costs nothing when nothing changed, and a SHA-256 content hash catches servers that
do not support conditional requests.

### Cancelled versus broken

A missing event does **not** mean a cancelled event. Atlas distinguishes:

- **Explicit cancellation notice** in the event's own text → REJECT with the reason.
- **Extraction failure** (HTTP error, timeout, parser miss) → attempt failure, source
  backs off, nothing is published or removed.
- **Event aged out** (past its start) → not published; the source stays registered.

Only the first case is treated as a cancellation signal. Everything else is a
transport problem and must never silently delete a listing.

---

## 7. Component map

```
atlas/
  cli.ts                 operator CLI: seed / discover / expand / crawl / review /
                         approve / reject / publish / report / kill-switch
  lib/
    types.ts             shared contracts between stages
    fetcher.ts           per-domain politeness, conditional requests, byte cap, retries
    robots.ts            robots.txt parsing, precedence rules, on-disk cache
    sitemap.ts           sitemap + sitemap-index parsing, event-page discovery
    discovery.ts         search providers, dance-source filters, excluded platforms
    osm.ts               OpenStreetMap census and search seeds (Overpass, ODbL)
    location.ts          venue / street address / city-state-zip heuristics
    normalize.ts         style, event type, price, address canonicalisation, jaro-winkler
    recurrence.ts        recurrence detection, DST-correct wall time, bounded horizons
    dedupe.ts            canonical URLs, dedupe keys, series keys, match proposals
    qa.ts                confidence scoring, PASS/QUARANTINE/REJECT, cancellation scoping
    llm.ts               client for the optional LLM sidecar
    llm-gate.ts          decides when a page is worth an LLM call
    pipeline.ts          orchestration and persistence
    parsers/
      html.ts            dependency-free HTML scanning
      dates.ts           date and time text parsing
      extract.ts         JSON-LD, RSS, iCal and heuristic HTML extraction
  scripts/
    test.ts              60 assertions over the deterministic core
    test-sidecar.ts      23 assertions over the LLM sidecar contract
    gen-local-schema.ts  derives the SQLite PoC schema from prisma/schema.prisma
  sidecar/
    main.py              FastAPI service wrapping ScrapeGraphAI (Python 3.12+)
  prisma/schema.local.prisma   generated — never hand-edit

src/app/api/atlas/tick/           scheduler entry point (Vercel Cron)
src/app/api/admin/atlas/          admin API: overview, candidates, sources
src/app/admin/atlas/page.tsx      Atlas admin screen
src/components/admin/atlas/       Atlas admin UI
```

---

## 8. Failure modes and how they are handled

| Failure | Handling |
|---|---|
| robots.txt disallows the path | Hard stop, recorded as `SKIPPED_BLOCKED`. Never fetched. |
| Site unreachable / DNS failure | Attempt recorded, exponential backoff, source stays registered |
| Timeout or oversized response | 20s timeout, 5 MB cap, retry twice with backoff |
| Server ignores conditional requests | Content hash catches the change |
| Page is JavaScript-rendered | Deterministic pass finds nothing → candidate never created (no false negatives published) |
| Extraction produces a partial record | Missing fields stay missing; confidence drops; QA quarantines |
| Duplicate detected | Match proposed for review, never auto-merged |
| Uncertain recurrence | Confidence penalty and quarantine; a series is never unbounded |
| Runaway spend | Global kill switch pauses every source; per-source pause; per-domain opt-out |
| Schema change in production | Atlas tables are additive; the web app ignores them, so a rollback is a table drop |

---

## 9. Deployment topology

```
                        ┌─────────────────────────────────────┐
                        │  Vercel (nododance.com)             │
   Vercel Cron ────────▶│  /api/atlas/tick  (daily 06:00)    │
                        │      → selects due sources          │
                        │      → writes CrawlJob rows         │
                        └──────────────────┬──────────────────┘
                                           │
                        ┌──────────────────▼──────────────────┐
                        │  Atlas Worker                       │
                        │  • Vercel Cron: enqueue mode        │
                        │  • Self-hosted runner: drain mode   │
                        │  (Fly.io / Railway / a small VPS)   │
                        │  Bounded concurrency, 1 request per │
                        │  domain at a time, 2s politeness    │
                        └──────────────────┬──────────────────┘
                                           │
                        ┌──────────────────▼──────────────────┐
                        │  Neon Postgres                      │
                        │  • ingestion tables (Atlas schema)  │
                        │  • published Event rows             │
                        └─────────────────────────────────────┘
```

**Recommended for this project:** run the worker on a small always-on container
(Fly.io or a $5 VPS) rather than inside Vercel functions. Vercel's hobby functions
time out at 60 seconds and the 300-second Pro limit still cannot hold a 70-source
crawl. The worker owns the schedule; Vercel only holds the web app and the cron
trigger. The worker needs **no** production write credentials beyond the ingestion
tables — a separate Neon branch or a restricted role should be used for the pilot.

---

## 10. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-REPO-AUDIT.md` | What exists today, what is missing, what Atlas changes |
| `ATLAS-SCRAPEGRAPHAI-EVAL.md` | Library evaluation and the cost model |
| `ATLAS-MIGRATION.md` | Schema additions and the production migration plan |
| `ATLAS-DISCOVERY.md` | How sources are found and expanded |
| `ATLAS-COST-MODEL.md` | Pilot and nationwide cost estimates |
| `ATLAS-PILOT-CHARLOTTE.md` | Pilot plan, results, acceptance criteria |
| `ATLAS-SECURITY.md` | Permissions, compliance and the opt-out process |
| `ATLAS-TESTING.md` | Test strategy and acceptance criteria |
| `atlas/README.md` | Developer quick reference |
