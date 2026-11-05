# Nodo Atlas — local proof of concept

> **Mission: map the dance world. Keep it connected.**
>
> **Status: paused (2026-11-04).** Core pipeline built, tested and running against
> live Charlotte sources. Nine deliverable documents written. Fifteen Obsidian notes
> written. Committed and pushed as `5fba47f`. Production migration still needs
> explicit approval.
>
> **Start here when picking it back up:**
>
> | I want to… | Do this |
> |---|---|
> | See the state of the world | `npx tsx atlas/cli.ts report` |
> | Work the review queue | `npx tsx atlas/cli.ts review` |
> | Read the design | `docs/atlas/ATLAS-ARCHITECTURE.md` |
> | Ship the schema to production | `docs/atlas/ATLAS-MIGRATION.md` — needs approval first |
> | Continue the national lead census | `docs/atlas/ATLAS-LEAD-CENSUS.md` §6 |
> | Check the tests | `npx tsx atlas/scripts/test.ts` (60 assertions) |

---

## What this is

Atlas is the automated discovery, extraction, verification and synchronisation
engine behind nododance.com. It finds public dance calendars, extracts them into
structured records, checks them for duplicates and quality, and puts them in a
human review queue. Nothing is published automatically.

```
Discovery → Source Registry → Crawl (robots gate) → Extraction ladder
   → Recurrence → QA → Dedupe → Review Queue → Publish
```

---

## Running it (local only — never touches production)

The PoC runs against a **local SQLite database** (`atlas/prisma/atlas.db`).
The production Neon database is never used by these commands.

```bash
# one-time: regenerate the local schema + client
npx tsx atlas/scripts/gen-local-schema.ts
npx prisma db push --schema atlas/prisma/schema.local.prisma --skip-generate --accept-data-loss
npx prisma generate --schema atlas/prisma/schema.local.prisma

# seed and run
npx tsx atlas/cli.ts seed:cities            # 7 rollout cities
npx tsx atlas/cli.ts seed:sources           # 9 verified Charlotte sources
npx tsx atlas/cli.ts expand                 # discover event pages via sitemaps
npx tsx atlas/cli.ts crawl --force --limit 70
npx tsx atlas/cli.ts review                 # candidate review queue
npx tsx atlas/cli.ts report                 # coverage + quality report

# unit tests (60 assertions)
npx tsx atlas/scripts/test.ts
```

Useful flags: `--reextract` (re-parse every page after an extractor change),
`--all` (show auto-rejected candidates in the review queue).

---

## Layout

```
atlas/
  cli.ts                 operator CLI (seed / discover / expand / crawl / review / publish / report / kill-switch)
  lib/
    types.ts             shared types
    fetcher.ts           HTTP with per-domain politeness, conditional requests, byte cap
    robots.ts            robots.txt parser + gate + on-disk cache
    sitemap.ts           sitemap parsing and event-page discovery
    discovery.ts         city discovery via search providers
    location.ts          venue / address / city heuristics
    normalize.ts         style, event type, price, address canonicalisation
    recurrence.ts        recurrence detection, DST-correct wall-clock maths
    dedupe.ts            deterministic + fuzzy entity resolution
    qa.ts                validation, confidence scoring, quarantine rules
    pipeline.ts          orchestration
    parsers/             json-ld, rss, ical, html, dates
  scripts/
    test.ts              unit tests for the deterministic core
    gen-local-schema.ts  derives the SQLite schema from prisma/schema.prisma
    debug-page.ts        inspects one live page
  prisma/
    schema.local.prisma  generated — do not hand-edit
```

---

## What is already true

- 60/60 unit tests pass, covering recurrence, DST, date parsing, dedupe and QA.
- Robots.txt is enforced as a hard gate; blocked paths are never fetched.
- Every page is fetched with ETag/Last-Modified, so unchanged pages cost nothing.
- Occurrences are computed in local wall time, so a 7pm class stays at 7pm across DST.
- Every detected series carries an explicit horizon and an expiry.
- Crawls are idempotent: re-running produces the same candidate, not a duplicate.
- Uncertain matches are proposed for review, never auto-merged.
- Organizer records always win a conflict.

## Where the pilot stands

Reproducible figures from the last clean local run (fresh database, 66 sources,
full crawl):

| Metric | Value |
|---|---|
| Cities registered | 7 |
| Sources registered | 66 (9 seeded + 57 via sitemap) |
| Candidate schools found | 64 |
| Candidates extracted | 150 |
| Passed QA | 33 |
| Quarantined | 32 |
| Rejected (mostly archived/past listings) | 85 |
| Duplicate & series proposals | 286 (94 EXACT, 3 NORMALIZED, 1 VENUE_TIME, 188 SERIES) |
| Recurrence rules detected | 7 (5 recurring candidates) |
| Crawl attempts | 65 successful, 1 failed |
| Published | 0 (every candidate awaits a decision) |

**Cost so far: $0.00.** The entire pilot ran on the deterministic ladder — no LLM
was called. That is the central cost finding.

Note on the match counts: a `SERIES` proposal means "same source page, different
occurrence" — it is *not* a duplicate. Only 98 of the 286 proposals are deterministic
duplicate candidates.

---

## Open items when we resume

1. **Documentation set** — the nine required deliverables in `docs/atlas/`:
   repository audit, ScrapeGraphAI feasibility, architecture, migration plan,
   discovery strategy, cost model, Charlotte pilot plan, security checklist,
   testing and acceptance criteria.
2. **Obsidian notes** — 15 linked notes in the Nodo Dance vault at
   `D:\Obsidian\El Moi Vault\Moi Vault\second-brain\projects\nodo-dance\Atlas\`.
3. **Production migration** — the schema in `prisma/schema.prisma` is additive but
   **has not been pushed to Neon**. It needs `npx prisma db push` plus a review
   of the `Event` column additions. Requires explicit approval.
4. **Title-quality pass** — "View Event →" titles are now resolved by following the
   link to the detail page, and leading clock times are stripped, but date-header
   titles ("SAT Nov 21") still slip through on Squarespace calendar grids.
5. **Recurrence coverage** — only 7 rules were detected because sitemap expansion
   favours one-event-per-page URLs over schedule pages. The registry should
   prioritise calendar pages (fewer, richer sources) over per-event pages.
6. **Search provider** — every free search endpoint (DuckDuckGo HTML/lite, Bing,
   Mojeek) is bot-challenged from this IP. A paid API (Serper ≈ $0.01/query,
   Brave ≈ $5/1k) is required for keyword discovery; sitemaps carry us without it.
7. **LLM long tail** — JS-rendered listings (Punchpass, Square) yield nothing
   deterministically. This is where ScrapeGraphAI earns its cost. The sidecar
   contract is designed but not yet built.
8. **OSM as a discovery channel** — the national census proved OpenStreetMap gives a
   free, licensed, key-free inventory of dance organisations
   (`atlas/scripts/us-lead-census.ts`). Wiring it into Agent A would give every
   metro a starting point without needing a search API.
9. **Finish the metro census** — 14 of 38 metros measured so far;
   `atlas/scripts/us-metro-retry.ts` recovers the rest.

---

## Hard rules this system follows

- Never publish without a human decision (until a source is explicitly approved).
- Never crawl a path robots.txt disallows.
- Never bypass authentication, CAPTCHAs or access controls.
- Never scrape private groups, private accounts or non-public content.
- Never copy event descriptions or promotional media — extract facts, link back.
- Never claim partnerships or endorsements.
- Never claim to have found every event in a city — report source coverage.
