# Nodo Atlas — local proof of concept

> **Mission: map the dance world. Keep it connected.**
>
> **Status: paused (2026-11-04).** Core pipeline built, tested and running against
> live Charlotte sources. Nine deliverable documents plus a lead census written.
> Sixteen Obsidian notes written. Committed and pushed as `5fba47f`, `ca6e874`,
> `119f4b0`. Production migration still needs explicit approval.
>
> **Start here when picking it back up:**
>
> | I want to… | Do this |
> |---|---|
> | See the state of the world | `npx tsx atlas/cli.ts report` |
> | Work the review queue | `npx tsx atlas/cli.ts review` |
> | Register channel sources for a city | `npx tsx atlas/cli.ts seed:channels --city <slug>` |
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
npx tsx atlas/cli.ts seed:channels          # Eventbrite / Meetup / DanceUS channels (21 per city)
npx tsx atlas/cli.ts discover:osm --city charlotte-nc   # OSM census + search seeds
npx tsx atlas/cli.ts expand                 # discover event pages via sitemaps
npx tsx atlas/cli.ts crawl --force --limit 70
npx tsx atlas/cli.ts review                 # candidate review queue
npx tsx atlas/cli.ts report                 # coverage + quality report

# unit tests
npx tsx atlas/scripts/test.ts               # 60 assertions — deterministic core
npx tsx atlas/scripts/test-sidecar.ts       # 23 assertions — LLM sidecar contract
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
    osm.ts               OpenStreetMap census and search seeds (Overpass, ODbL)
    llm.ts               client for the optional LLM sidecar
    llm-gate.ts          decides when a page is worth an LLM call
    location.ts          venue / address / city heuristics
    normalize.ts         style, event type, price, address canonicalisation
    recurrence.ts        recurrence detection, DST-correct wall-clock maths
    dedupe.ts            deterministic + fuzzy entity resolution
    qa.ts                validation, confidence scoring, quarantine rules
    pipeline.ts          orchestration
    parsers/             json-ld, rss, ical, html, dates
  scripts/
    test.ts              unit tests for the deterministic core
    test-sidecar.ts      contract tests for the LLM sidecar
    gen-local-schema.ts  derives the SQLite schema from prisma/schema.prisma
    us-lead-census.ts    national OSM lead census
    us-metro-census.ts   metro OSM census
    production-snapshot.ts  read-only counts from the live database
  sidecar/
    main.py              FastAPI service wrapping ScrapeGraphAI (Python 3.12+)
  prisma/
    schema.local.prisma  generated — do not hand-edit
```

---

## Channel sources (added 2026-11-09)

One public aggregator page covers a whole style in a whole city, so channels
reach national scale before any per-organizer source is registered.

```
npx tsx atlas/cli.ts seed:channels --city charlotte-nc   # 21 sources / city (7 styles × 3 platforms)
npx tsx atlas/cli.ts crawl --via CHANNEL --limit 50      # crawl only channel sources
```

**Worldwide DanceUS enumeration** — `discover:danceus` reads the public
danceus.org style pages (salsa, argentine-tango, swing, latin-dance, bachata,
kizomba) and registers every city style-calendar they link, worldwide, with a
DiscoveryCity auto-seeded per country. US slugs resolve through the state
registry; world slugs resolve through the world registry in
`atlas/lib/channels.ts`, which covers the shapes they actually publish:
`london-uk`, `berlin-germany`, `toronto-on-canada` and `montreal-qc-canada`
(province → IANA zone), `sydney-australia` / `perth-australia` (city → zone,
AU slugs carry no province) and the city-less `puerto-rico`. Unknown areas are
skipped, never guessed:

```
npx tsx atlas/cli.ts discover:danceus                    # 109 calendars across 80 cities / 9 countries (2026-11-09)
npx tsx atlas/cli.ts crawl --via CHANNEL_DANCEUS         # 476 found · 379 accepted (world pass included)
```

Every discovered URL passes the real robots gate before registration; the
robots-blocked /events/bachata/ and /events/latin-dance/ trees are excluded.
A style page that cross-links calendars of another style (the /bachata/ page
links salsa calendars) dedupes through the source registry's canonical URL.

Measured worldwide run (2026-11-09): 83 cities, 233 sources, 9 countries
(US 50, DE 7, GB 7, AU 7, CA 6, ES 2, CO/FR/IE/PR 1 each); registry totals
**1 649 candidates, 1 186 passed QA**. Eventbrite/Meetup channel owners stay
US-scoped; only the DanceUS channel is worldwide so far.

| Platform | URL pattern | Serves | Notes |
|---|---|---|---|
| Eventbrite | `/d/{st}--{city}/{style}/` | SSR JSON-LD (`ItemList` → `ListItem` → `Event`) | includes venue name, street address and GeoCoordinates |
| Meetup | `/find/us--{st}--{city}/{style}/` | SSR JSON-LD | the `?keywords=` query form is robots-disallowed; the path form is not. Topic pages exist per style+city combo — 404s back off automatically |
| DanceUS | `/events/{style}/{city}-{st}-{style}-calendar/` | HTML listing | per-city calendars exist for some styles only; `/events/bachata/`, `/events/zouk/` and several others are robots-disallowed |

Design: every channel source is isolated (`ChannelSourceSeed` in
`atlas/lib/channels.ts`), polled daily (`crawlIntervalDays: 1`), gated by
robots.txt like everything else, and deduped against the same registry — a
listing found on Eventbrite *and* DanceUS produces two candidates and a
deterministic EXACT proposal, never a double publication.

A bespoke organizer `.ics` feed can be added at seed time:
`npx tsx atlas/cli.ts seed:channels --city <slug> --ics <feed-url> --styles '["Salsa"]'`.

Measured Charlotte run (2026-11-09): 21 channels registered, 82 candidates
extracted in one crawl, 56 passed QA at ≥0.90 confidence with venue, address
and — for Eventbrite/DanceUS — exact coordinates.

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
7. **LLM long tail** — the ScrapeGraphAI sidecar is built (`atlas/sidecar/`,
   Python 3.12+) and wired into the extraction ladder behind a strict gate. It
   needs an LLM key to run; the contract is tested without one
   (`npx tsx atlas/scripts/test-sidecar.ts`, 23 assertions).
8. **OSM is a census and a search seed, not a source channel** — measured: 21
   dance-name matches in Charlotte, 8 real organisations (38%), only 1 with a
   website (5%). The organisation *names* are the valuable output; they are
   written to `atlas/.cache/osm-seeds-<city>.json` for keyword discovery.
9. **Turn OSM names into search queries** — pair OSM (free names) with a search
   API (Serper ≈ $0.01/query) to reach websites OSM never recorded.
10. **The lead census is complete** — 37 of 37 priority metros measured
    (315 venues, 907 named dance places). See `docs/atlas/ATLAS-LEAD-CENSUS.md`.

---

## Hard rules this system follows

- Never publish without a human decision (until a source is explicitly approved).
- Never crawl a path robots.txt disallows.
- Never bypass authentication, CAPTCHAs or access controls.
- Never scrape private groups, private accounts or non-public content.
- Never copy event descriptions or promotional media — extract facts, link back.
- Never claim partnerships or endorsements.
- Never claim to have found every event in a city — report source coverage.
