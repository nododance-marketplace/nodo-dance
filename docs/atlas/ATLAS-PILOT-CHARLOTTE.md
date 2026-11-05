# Nodo Atlas — Charlotte Pilot

> Charlotte pilot: objective, method, measured results and acceptance criteria
> for Nodo Atlas. Last updated: 2026-11-04.
> **Status: pilot executed — every candidate awaits a human decision.**
> Companion documents: `ATLAS-DISCOVERY.md`, `ATLAS-COST-MODEL.md`,
> `ATLAS-ARCHITECTURE.md`.

---

## 1. Objective

Reduce manual event entry for the Charlotte market while **improving**
coverage, accuracy and freshness — not just moving the same data entry from a
spreadsheet into a tool.

| Dimension | Before Atlas | Target with Atlas |
|---|---|---|
| Coverage | Whatever the founder happened to notice | Every public calendar in the metro, re-checked on a schedule |
| Accuracy | Typed by hand, typos and stale copies | Extracted from the source, QA-gated, with an evidence trail per field |
| Freshness | Re-typed when someone remembered | Conditional re-fetch detects change; cancellations are detected, not silently dropped |
| Effort | Data entry | Review of a queue |

**Nothing is published without a human decision.** Atlas produces candidates
and proposals; a person publishes.

---

## 2. Success criteria

| # | Criterion | Threshold | Why this threshold |
|---|---|---|---|
| S1 | Relevant public sources registered | ≥ 20 | Enough to cover a metro; below 20 the registry is anecdotal |
| S2 | Recurring calendars identified | ≥ 20 | Recurring listings are the core of the product |
| S3 | Candidates extracted | ≥ 50 | Proves the extraction ladder works on real pages |
| S4 | Recurrence verified against existing Nodo listings | ≥ 10 series checked | Proves the series model matches what is already published |
| S5 | Duplicate detection measured | precision and recall recorded, not assumed | A wrong merge is worse than a duplicate |
| S6 | Admin review exercised | ≥ 20 candidates reviewed end-to-end | Proves the review → approve → publish path works |
| S7 | Cancellation / change handling tested | ≥ 1 cancelled event and ≥ 1 changed event observed | Proves listings do not go stale silently |
| S8 | Cost per useful published listing estimated | recorded, with the arithmetic | Keeps the rollout honest |

---

## 3. Scope and method

### 3.1 The nine seed sources

All nine are URLs that organizers had already published on nododance.com — the
founder has a relationship with each, which is the strongest permission signal
Atlas has short of a written agreement. No social-platform URLs were used.

| Organisation | Seed URL | Category | Styles |
|---|---|---|---|
| Afincao | `https://afincaodance.com/book-a-class` | `SCHOOL` | Salsa |
| CLT Dance | `https://www.cltdance.com/cltdanceschedule` | `SCHOOL` | Salsa, Bachata |
| Kizomba Charlotte | `https://www.kizombacharlotte.com/home` | `EVENT_ORG` | Kizomba |
| Tango CLT | `https://www.tangoclt.com/practica` | `EVENT_ORG` | Tango |
| Lynn's Dance Club | `https://www.thelynnsdanceclub.com/` | `STUDIO` | Tango, Ballroom |
| Charlotte Westies | `https://www.charlottewesties.com/` | `EVENT_ORG` | West Coast Swing |
| Rumba Latina Dance | `https://rwlatindance.com/` | `SCHOOL` | Salsa, Bachata |
| Rumba Latina Dance (booking) | `https://rwlatindance.square.site/` | `SCHOOL` | Salsa, Bachata |
| Rumba Latina Dance (classes) | `https://rumbaolatindance.punchpass.com/classes` | `AGGREGATOR` | Salsa, Bachata |

Registered with `discoveredVia: 'PUBLISHED_ON_NODO'`.

### 3.2 Sitemap expansion to 66

Each seed domain was then expanded through its own sitemap. This is the
mechanism that produced the other 57 sources.

```
  9   seeds                              (channel A — permission + trust)
    │
    ▼  atlas expand  →  SitemapReader.read()  →  looksLikeEventPage()
  57  new sources                        (channel B — free, exhaustive)
    │
    ▼
  66  DiscoverySource rows across 9 domains (6 of which published a sitemap)
```

| Domain | Sitemap URLs | Event pages found | New sources registered |
|---|---|---|---|
| `afincaodance.com` | 107 | 74 | 20 |
| `cltdance.com` | 83 | 45 | 20 |
| `tangoclt.com` | 23 | 14 | 13 |
| `rwlatindance.square.site` | 125 | 0 | 0 |
| `charlottewesties.com` | 22 | 2 | 2 |
| `rwlatindance.com` | 12 | 2 | 2 |
| `kizombacharlotte.com` | 0 | 0 | 0 |
| `thelynnsdanceclub.com` | 0 | 0 | 0 |
| `rumbaolatindance.punchpass.com` | 0 | 0 | 0 |
| **Total** | **372** | **137** | **57** |

(The figures were re-measured on 2026-11-04 with the repository's own
`SitemapReader` and `looksLikeEventPage()` and match the pilot run. The
`thelynnsdanceclub.com` row read 1 URL / 0 event pages in the pilot log and 0
/ 0 today — either way, no event pages.)

Note the registration cap: `expand` registers only the first 20 event pages
per source (`eventPages.slice(0, 20)`), so `afincaodance.com` exposed 74 event
pages but contributed 20 sources. There are more pages available in that
domain than the pilot harvested.

---

## 4. Measured results

### 4.1 The recorded pilot snapshot

| Metric | Value |
|---|---|
| Sources registered | 66 (9 seeded + 57 via sitemap) |
| Crawl attempts — successful | 165 |
| Crawl attempts — skipped, unchanged | 72 |
| Crawl attempts — failed | 5 |
| Candidates extracted | 95 (up to ~175 depending on extractor version) |
| Passed QA | 29 |
| Quarantined | 6 |
| Rejected | 60 |
| Duplicate proposals | 259 |
| Candidate schools found | 63 |
| **Published** | **0** — every candidate awaits a human decision |
| **Total cost** | **$0** |

### 4.2 The live local database

A `atlas crawl --force --limit 70` re-run was in flight against the local
PoC database (`atlas/prisma/atlas.db`) while this document was written, so
the live counts move as the run progresses. A read taken during that run:

| Metric | Live reading | Note |
|---|---|---|
| Sources registered | 66 | stable |
| Crawl attempts | 66 (65 SUCCESS, 1 FAILED) | run in progress |
| Candidates extracted | 150 | climbing toward the 175 upper bound |
| PASS / QUARANTINE / REJECT | 33 / 32 / 85 | |
| Duplicate proposals | 197 — 196 `SERIES`, 1 `EXACT` | see §4.4 |
| Candidates with at least one proposed match | 35 | |
| Recurrence rules detected | 3 | **the weakest metric — see §4.4** |
| Candidate schools | 64 | |
| Source evidence rows | 246 | per-field provenance |
| Events published | 0 | |
| Moderation decisions recorded | 0 | the review UI exists but no decision has been made in the PoC |
| Machine cost | $0 | |

### 4.3 Reproducing the run

```bash
npx tsx atlas/cli.ts seed:cities
npx tsx atlas/cli.ts seed:sources
npx tsx atlas/cli.ts expand
npx tsx atlas/cli.ts crawl --force --limit 70
npx tsx atlas/cli.ts review          # add --all to see auto-rejected candidates
npx tsx atlas/cli.ts report
npx tsx atlas/scripts/test.ts        # 60 assertions over the deterministic core
```

Flags: `--reextract` re-parses every page after an extractor change (it clears
the `ETag` / `Last-Modified` fingerprints); `--force` ignores the crawl
schedule.

### 4.4 What the numbers actually say

| Finding | Evidence |
|---|---|
| Discovery works without a search engine | 57 of 66 sources came from sitemaps |
| The QA gate is doing real work | 60 of 95 candidates rejected in the recorded snapshot; in the live reading all 85 rejections carry the reason "Event date is in the past" (§5) |
| Dedupe is mostly finding *series*, not duplicates | 196 of 197 proposed matches are `SERIES` — same page, different date. Only 1 is an `EXACT` duplicate |
| Recurrence detection is the weak spot | 3 recurrence rules detected against 150 candidates |
| Cost is not the constraint | $0 across the entire pilot |
| Review capacity is the constraint | 0 decisions recorded; the queue is the bottleneck, not the crawler |

The 259 "duplicate proposals" in the recorded snapshot must be read carefully:
most of them are the same listing page appearing on different dates, which is
a *series* signal, not a duplicate. Only `EXACT` and `VENUE_TIME` matches
(mean same URL + same date; same address + same date + same time) are
deterministic duplicates, and both are proposed for human confirmation rather
than auto-merged.

### 4.5 What "published 0" means

Zero events were published, by design. `atlas publish` and
`PATCH /api/admin/atlas/candidates` both refuse to publish a candidate whose
`reviewStatus` is not `APPROVED`. The pilot deliberately stopped at the queue
so that nothing appears on nododance.com without a person deciding it. The
0 is a feature of the workflow, not a failure of the pipeline.

---

## 5. Why 60 candidates were rejected

The QA reason distribution for the rejected candidates:

| Reason | Count |
|---|---|
| `Event date is in the past` | 52 |
| `Event date is in the past` + `No location information` | 33 |
| **Total rejected** | **85** (live reading; 60 in the recorded snapshot) |

**Every single rejection was an archived listing.** Not one rejection was a
quality failure in the extractor, and not one was a cancellation.

Per source:

| Domain | Rejected | Date range in the rejected set | What the page contains |
|---|---|---|---|
| `afincaodance.com` | 42 | 2023-06-15 → 2024-08-17 | Two series of class listings from 2023 and 2024 — an archive, not a calendar |
| `tangoclt.com` | 23 | 2024-02-14 → 2026-09-23 | Past workshops, milongas and "The Long Room" listings |
| `cltdance.com` | 19 | 2023-09-24 → 2026-09-13 | "Ritmo Latino Dance Social" occurrences, including 2025 and 2026 past dates |
| `charlottewesties.com` | 1 | 2026-09-10 | One past event on a regional-events page |

`Ritmo Latino Dance Social` was caught correctly by the expiry rule on every
occurrence: 18 past dates (2023-10-22 through 2026-09-13) were rejected,
while the 2026-11-22 occurrence passed. That is exactly the behaviour wanted
from a calendar extractor: the archive is filtered, the future is kept.

**Rejecting past listings is correct behaviour, and it demonstrates the QA gate
working.** A city calendar is append-only history; an extractor that trusted
every date on the page would flood the review queue with 2023 classes and
bury the three listings that actually matter.

### 5.1 The expiry rule

`atlas/lib/qa.ts` → `validateEvent()`:

```
  if (eventDate < now - 2 days)  →  REJECT: "Event date is in the past"
```

The two-day grace absorbs timezone differences between the source's wall
clock and the server's date. There is no symmetric "too far in the future"
rule: a recurring series anchored months ahead is legitimate.

### 5.2 The cancellation-detection defect and its fix

The first implementation judged cancellation on the **whole page text**. A
school page that mentions "cancelled" in an unrelated section invalidated
every listing on that page. The fix scopes the check to the event's own text:

```typescript
// atlas/lib/pipeline.ts
const cancellationScope = `${event.title} ${event.description ?? ''}`
const qa = validateEvent(event, {
  now: new Date(),
  permissionsStatus: source.permissionsStatus,
  robotsAllowed: true,
  sourceCity: source.city?.name,
  sourceState: source.city?.state,
  pageText: result.body,
  explicitlyCancelled: isCancellationNotice(cancellationScope),
})
```

`isCancellationNotice()` additionally requires the sentence to read like a
notice ("…this class is cancelled…"), not merely to contain the word. This is
the difference between a cancelled event and a cancellation *policy* mentioned
on a school home page.

---

## 6. Known extraction weaknesses found in the pilot

### 6.1 Generic titles on calendar indexes — **fixed**

Squarespace calendar indexes render every entry with the same call to action,
`"View Event →"`. Extracted as a title, it is useless.

Fix: `isGenericTitle()` in `atlas/lib/parsers/html.ts` recognises the
call-to-action list (`view event`, `learn more`, `register`, `save the date`,
`buy tickets`, …), and `Atlas.resolveGenericTitles()` follows the link to the
detail page and re-extracts from there, keeping the calendar page as the
discovery URL and the detail page as the canonical URL. The follow is
robots-checked and bounded — each resolved URL is fetched at most once per run.

Remaining weakness: `pickTitle()` falls back through anchor text → nearest
heading → first line → `og:title`, and a page where *all four* are generic
still yields a heading such as `"Calendar Events — Afincao Dance"`. That title
is harmless but not publishable-quality.

### 6.2 Leading clock times in titles — **fixed**

`"8:15 pm Afro-Cuban"` is a time, not a title. `stripLeadingTime()` removes a
leading `H:MM am/pm` (and a bare hour) from every candidate title before it is
stored. This is applied in `pickTitle()` to all four title sources.

### 6.3 Date-header titles — **open**

Some listings still carry the calendar's date header as their title, e.g.
`"SAT Nov 21"`. The `isGenericTitle()` list does not cover date-shaped
strings, so they survive into the queue. They are not published because they
fail QA on location, but they inflate the queue.

*Status:* recorded in the earlier pilot pass; the current local snapshot does
not reproduce the string, so it must be re-checked once the in-flight crawl
finishes. Proposed fix: treat a title that is only a date/time as generic and
resolve it through the same detail-page follow as §6.1.

### 6.4 JavaScript-rendered listings — **open, and partly contradicted**

`atlas/README.md` records Punchpass and Square as yielding nothing
deterministically. The measurement is mixed:

| Source | Measured |
|---|---|
| `rwlatindance.square.site` | 125 sitemap URLs, **0** event pages, 1 successful fetch, no candidates — confirmed |
| `rumbaolatindance.punchpass.com/classes` | 1 fetch, **17 `PASS` candidates** via the HTML tier — the page is server-rendered and its class list is in the markup |

So the Punchpass class page *is* parseable, but the records it yields are
noisy: the HTML tier concatenates neighbouring card fields, so titles arrive
as `"Afro-Cuban with Ivan 40 spots left Rumbao Staff Viva Collective Studios
901 N Tryon Street 28206"` and the style detector occasionally assigns the
wrong style. This is the concrete case where a structured tier-5 extraction
would earn its cost — the sidecar contract is designed but not built.

### 6.5 Wall-clock vs UTC in the HTML tier — **open, needs a dedicated check**

One Punchpass candidate records `localTime` `13:00` for a listing whose visible
card text reads `6:00 pm`. Either the time was taken from a neighbouring card
in the same text window (the HTML tier reads ±220 characters after the date
anchor) or a wall-clock value was converted as if it were UTC. Both would be
serious for publication, because the published start time would be wrong by
hours. Every candidate whose time comes from the HTML tier must be verified
against the source page before it is published; JSON-LD times are trustworthy
because they carry an explicit offset.

---

## 7. The manual audit protocol

### 7.1 The procedure

For every candidate that reaches the queue:

```
  1. OPEN the source page in a browser. Read what the source actually says.
  2. CHECK title   — is it an event name, or a page heading / call to action?
  3. CHECK date    — is it in the future? Which date did the page state?
  4. CHECK time    — is it the event's time, or a neighbour's? (see §6.5)
  5. CHECK venue   — is the venue/address the event's, not the school's HQ?
  6. CHECK style  — is the style what the page says? "Other" needs a decision.
  7. CHECK type    — SOCIAL / TANGO_MILONGA / GROUP_CLASS / WORKSHOP / FESTIVAL
  8. CHECK matches — does a proposed match point at an existing Nodo listing?
                      If yes: is it the same occurrence, the same series, or
                      a different event that happens to share a venue?
  9. DECIDE        — APPROVE, REJECT (with a reason), or leave for a second pair
                      of eyes.
 10. PUBLISH       — only an APPROVED candidate can be published; the source
                      link and the reviewer's identity are recorded.
```

The review surface is `/admin/atlas` → `/api/admin/atlas/candidates`, which
returns the candidate, its `SourceEvidence` rows (field-by-field provenance),
its proposed `EntityMatch` rows and its `RecurrenceRule` — everything needed to
make the decision without leaving the screen.

### 7.2 How precision will be measured

Precision = candidates that a human judged correct, over candidates reviewed.

```
  precision = correct candidates ÷ candidates reviewed
```

Measured on a fixed sample: the first 50 reviewed candidates, tracked in a
sheet with one row per candidate (id, source, verdict, error type). The error
types are the ones the pilot already found: wrong title, wrong date, wrong
time, wrong venue, wrong style, wrong type, already published.

A precision below 0.90 means the extractor is producing more noise than value
and the fix belongs in the extractor, not in the reviewer.

### 7.3 How recall will be measured

Recall cannot be measured by the pipeline — it only knows about the pages it
fetched. It is measured by a **manual sweep**: a person opens every public
calendar they can find for the metro (school sites, event-organiser sites,
community pages, city park and recreation listings) and lists every recurring
dance event for the next 30 days. That manual list is the denominator;
the number of those events that appear in Nodo is the recall.

```
  recall = Nodo listings that appear in the manual sweep
          ÷ total events in the manual sweep
```

This is a one-time, per-metro measurement. It is also the only honest way to
find the sources that sitemap expansion and keyword search both missed.

---

## 8. Acceptance criteria

The operator fills in the Result column. A criterion passes only when the
measured value meets the threshold; `—` means not yet measured.

| # | Criterion | Threshold | Measured | Result | Notes |
|---|---|---|---|---|---|
| A1 | Relevant public sources registered | ≥ 20 | 66 | | 9 seeds + 57 sitemap |
| A2 | Recurring calendars identified | ≥ 20 | 3 recurrence rules detected; recurring calendars not yet counted separately | | **Failing — see §4.4** |
| A3 | Candidates extracted | ≥ 50 | 95 (recorded snapshot) | | |
| A4 | Recurrence verified against existing Nodo listings | ≥ 10 series checked | — | | |
| A5 | Duplicate detection measured | precision + recall recorded | 197 proposals (196 `SERIES`, 1 `EXACT`); 0 verified against Nodo | | |
| A6 | Admin review exercised | ≥ 20 candidates reviewed end-to-end | 0 moderation decisions recorded | | |
| A7 | Cancellation / change handling tested | ≥ 1 cancelled event, ≥ 1 changed event observed | expiry rule exercised on 85 candidates; cancellation scoping fixed | | |
| A8 | Cost per useful published listing | recorded with arithmetic | machine $0.00; 0 listings published | | see §8.1 |
| A9 | Permission posture clean | every source either organizer-published or sitemap-public, 0 social-platform URLs | 66/66 | | |
| A10 | robots.txt compliance | 0 fetches of disallowed paths | 0 `SKIPPED_BLOCKED` fetches; the gate is checked before every fetch | | |

### 8.1 Cost per useful published listing (estimate)

No listing has been published yet, so the measured value is undefined. The
projection, using the measured machine cost of $0 and the assumed review rate
of 40 candidates/hour:

```
  publish the first 10 reviewed candidates
    machine cost  : 10 × $0.00                       = $0.00
    review cost   : 10 ÷ 40 candidates/hour          = 0.25 review-hours
    cost per useful published listing                = $0.00 + 0.25 review-hours
```

In the recorded snapshot, 35 of the 95 extracted candidates (29 `PASS` + 6
`QUARANTINE`, 37%) reached the queue — the QA gate removed 63% of the work
before a human saw it. The machine cost of a published listing is zero; the
real price is a quarter of an hour of attention.

---

## 9. Recommended next metro areas

Ordered by the seeded priority in `atlas/cli.ts`.

| Order | Metro | Time zone | Why it is next |
|---|---|---|---|
| 1 | **Raleigh, NC** | `America/New_York` | Same ecosystem as Charlotte: the Triangle's dance community overlaps, venues and instructors move between the two. A short drive, but a genuinely different venue density — smaller studios, more community-organised events. Tests whether the pipeline generalises beyond one metro's source mix. |
| 2 | **Durham, NC** | `America/New_York` | Same ecosystem, same reasoning; different venue density again. Together Raleigh + Durham validate the "one region, several cities" hypothesis before any coast-to-coast jump. |
| 3 | **Atlanta, GA** | `America/New_York` | Large Southern community with a strong salsa/bachata culture — the styles most represented in the Charlotte source set. Identical timezone, so no new timezone behaviour is introduced. |
| 4 | **Austin, TX** | `America/Chicago` | Large and active scene. Different timezone — the first real test of per-city wall-clock handling (`America/Chicago`) against `America/New_York` sources. |
| 5 | **Miami, FL** | `America/New_York` | The strongest social-dance culture in the set; the most likely to produce a high-volume candidate queue, which stress-tests review capacity. |
| 6 | **Chicago, IL** | `America/Chicago` | Very large and dense — the biggest source pool in the set, and the biggest review queue. Scale test for both the worker and the reviewer. |

### 9.1 The sequencing rule

**Each metro starts only after the previous one meets the acceptance criteria
in §8.** Not in parallel, not "as capacity allows". The reason is specific:

1. Every extraction weakness found in the pilot (§6) was found *because* the
   pilot ran a full sweep and someone read the output. A second and third
   metro started before the first is clean multiplies the number of known-bad
   records in the queue.
2. The recurring-calendar criterion (A2) is currently failing. Recurrence is
   the feature the product is built on; it should be fixed and proven in one
   metro before it is exercised in six.
3. Review capacity, not crawler capacity, is the binding constraint. Adding
   metros before the review loop is measured makes the queue grow faster than
   it is drained.
4. Each metro adds permanent operating cost (a source to maintain, a cadence
   to honour, a city to roll back if a site objects).

---

## 10. The go / no-go statement

> **Do not begin nationwide crawling until the Charlotte pilot meets the agreed
> quality, permission and cost thresholds.**
>
> Specifically: no source outside the Charlotte metro may be crawled until
> §8 is complete — in particular A2 (recurring calendars identified), A6 (admin
> review exercised) and A8 (cost per useful published listing recorded) — and
> until the §6 weaknesses are either fixed or explicitly accepted with a
> documented consequence.
>
> "Nationwide" means more than adding cities to the registry. It means a
> recurring obligation to hundreds of independent sites. The Charlotte pilot
> is the cheapest possible place to discover what that obligation actually
> looks like, and it is not finished.

Nothing in this document authorises crawling outside Charlotte. The kill
switch (`atlas kill-switch`, or `POST /api/admin/atlas/overview` with
`action: 'pause-all'`) pauses every registered source, and the six non-Charlotte
cities are seeded with `status: 'PENDING'`.

---

## 11. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-DISCOVERY.md` | The four discovery channels and the sitemap expansion results |
| `ATLAS-COST-MODEL.md` | Per-page and per-scenario costs; the review-time argument |
| `ATLAS-ARCHITECTURE.md` | Extraction ladder, scheduling policy, failure modes |
| `atlas/README.md` | Developer quick reference; the pilot's open items |
| `atlas/lib/qa.ts` | PASS / QUARANTINE / REJECT rules and confidence scoring |
| `atlas/lib/dedupe.ts` | `EXACT` / `NORMALIZED` / `VENUE_TIME` / `FUZZY_TITLE` / `SERIES` matching |
| `atlas/lib/pipeline.ts` | Orchestration, generic-title resolution, cancellation scoping |
| `src/app/admin/atlas/page.tsx` | The review screen |
| `src/app/api/admin/atlas/candidates/route.ts` | Review queue API, approve / publish path |
