# Nodo Atlas — Source Discovery Strategy

> Source discovery strategy for Nodo Atlas. Last updated: 2026-11-04.
> **Mission: map the dance world. Keep it connected.**
> Owner: Nodo Dance engineering. Companion documents: `ATLAS-ARCHITECTURE.md`,
> `ATLAS-COST-MODEL.md`, `ATLAS-PILOT-CHARLOTTE.md`.

---

## 1. What discovery is for

Discovery finds **candidate sources** — public pages that advertise dance
events. It never creates a published record. A discovered URL becomes a source
in the registry, and from there the normal pipeline takes over: robots gate →
conditional fetch → extraction ladder → QA → dedupe → human review.

```
  4 channels, in priority order
  ────────────────────────────────────────────────────────────────────────────
  (a) URLs already published on nododance.com   → strongest permission signal
  (b) Sitemap expansion of a known domain       → the primary mechanism
  (c) Keyword search via a paid API             → supplementary, paid
  (d) Curated / manual registration             → always available, always slow
  ────────────────────────────────────────────────────────────────────────────
        │
        ▼
  DiscoverySource row (url, domain, city, styles, discoveredVia, cadence)
        │
        ▼
  robots.txt gate → conditional fetch → extraction ladder → QA → dedupe
        │
        ▼
  CandidateEvent → /admin/atlas review queue → human decision → Event
```

**The central finding of the Charlotte pilot:** of the 66 sources registered,
9 came from channel (a) and **57 came from channel (b)** — sitemap expansion.
Channel (c) contributed nothing, because every free search endpoint tested
returned a bot challenge. The registry is built by following a site's own
sitemap, not by guessing URLs or scraping a search engine.

---

## 2. The four channels at a glance

| Priority | Channel | Signal used | Cost | Pilot result |
|---|---|---|---|---|
| 1 | URLs already published on nododance.com | The organizer published its own page on Nodo; the founder has a relationship with them | $0 | 9 sources |
| 2 | Sitemap expansion from a known domain | The site's own `sitemap.xml` enumerates its public event pages | $0 | **57 sources** |
| 3 | Keyword search via a paid API | Search ranking over generated style queries | ≈ $0.01/query | 0 sources (free endpoints blocked) |
| 4 | Curated / manual registration | Human knowledge, referrals, organizer outreach | Human time | Always available |

---

## 3. Channel A — URLs already published on nododance.com

These are the strongest permission signal Atlas has short of a written
agreement: **the organizer already chose to publish its calendar on
nododance.com.** The founder has a relationship with each of these, so a
polite re-check of the same public page is a re-read of content they asked us
to surface.

The seeds are declared in `atlas/cli.ts` (`SEED_SOURCES`) and registered with
`discoveredVia: 'PUBLISHED_ON_NODO'`:

| Organisation | Seed URL | `sourceCategory` | Styles | Time zone |
|---|---|---|---|---|
| Afincao | `https://afincaodance.com/book-a-class` | `SCHOOL` | Salsa | `America/New_York` |
| CLT Dance | `https://www.cltdance.com/cltdanceschedule` | `SCHOOL` | Salsa, Bachata | `America/New_York` |
| Kizomba Charlotte | `https://www.kizombacharlotte.com/home` | `EVENT_ORG` | Kizomba | `America/New_York` |
| Tango CLT | `https://www.tangoclt.com/practica` | `EVENT_ORG` | Tango | `America/New_York` |
| Lynn's Dance Club | `https://www.thelynnsdanceclub.com/` | `STUDIO` | Tango, Ballroom | `America/New_York` |
| Charlotte Westies | `https://www.charlottewesties.com/` | `EVENT_ORG` | West Coast Swing | `America/New_York` |
| Rumba Latina Dance | `https://rwlatindance.com/` | `SCHOOL` | Salsa, Bachata | `America/New_York` |
| Rumba Latina Dance (booking) | `https://rwlatindance.square.site/` | `SCHOOL` | Salsa, Bachata | `America/New_York` |
| Rumba Latina Dance (classes) | `https://rumbaolatindance.punchpass.com/classes` | `AGGREGATOR` | Salsa, Bachata | `America/New_York` |

Three URLs for the same organisation (Rumba Latina Dance) is deliberate: the
school's own site, its booking site and its class listing are three different
public surfaces with three different freshness characteristics.

**Social platforms are deliberately absent.** Facebook and Instagram pages are
private, non-public or login-gated in the general case, and Atlas never scrapes
private groups, private accounts or non-public content. When the seed list was
first assembled from organiser-submitted URLs, three of the twelve URLs were
Facebook or Instagram pages; they were removed on policy grounds and the
committed list is the nine remaining organizer-owned URLs above. (That history
is not recorded in code — `SEED_SOURCES` in `atlas/cli.ts` contains only the
surviving nine, and the exclusion of social platforms is enforced separately by
`isExcludedDomain()`, §6.)

---

## 4. Channel B — Sitemap expansion (the primary mechanism)

A site's own sitemap enumerates its public pages. Expanding one known domain
reveals every sibling event page on that domain — with no search engine, no
API key and no cost. This is the mechanism that produced 57 of the 66
registered sources.

### 4.1 How it works

`atlas/lib/sitemap.ts` → `SitemapReader.read(origin)`:

```
  origin (https://example.com)
    │
    ├─ robots.txt gate on the sitemap URL itself
    ├─ try /sitemap.xml
    ├─ try /sitemap_index.xml          (in order, first one that returns
    ├─ try /sitemap-index.xml           →  usable URLs wins)
    │
    ├─ <sitemapindex> → follow up to 5 child maps (maxSitemaps = 5),
    │                   each child also robots-gated
    └─ <urlset> → parse <loc>, <lastmod>, <priority>
         │
         ▼
   looksLikeEventPage(url)  ← the filter below
         │
         ▼
   DiscoverySource rows with discoveredVia: 'SITEMAP'
```

Every sitemap request goes through the same robots gate as a page fetch
(`RobotsCache.load` → `RobotsCache.decide`). A domain that disallows
`/sitemap.xml` in `robots.txt` is never asked for it.

### 4.2 The URL filter

`looksLikeEventPage()` in `atlas/lib/sitemap.ts` is a two-stage string test on
the lowercased path.

**Stage 1 — reject known non-event paths** (`NON_EVENT_PATHS`):

```
/blog  /news  /about  /contact  /privacy  /terms  /faq
/cart  /shop  /product  /login  /wp-admin  /feed
/tag/  /category/  /author/  /search  /careers  /press  /media
/gift  /coupon  /membership  /memberships  /staff  /team
```

**Stage 2 — require at least one strong event signal** (`EVENT_URL_HINTS`):

```
event  calendar  schedule  class  social  milonga  practica  practice
workshop  festival  party  lesson  upcoming  what-s-on  whats-on
gatherings  community  flights  nights  gather
```

Both lists are substring matches against the pathname, so `/events/ritmo-latino`
matches on `event` while `/blog/2023/party-recap` is rejected on `/blog` first.

### 4.3 Measured results — Charlotte pilot

Sitemap expansion was run against all nine seed domains. The table below was
re-measured on 2026-11-04 by running the repository's own `SitemapReader` and
`looksLikeEventPage()` against each origin; the figures match the pilot run.

| Domain | Sitemap URLs | Event pages found | New sources registered | Note |
|---|---|---|---|---|
| `afincaodance.com` | 107 | 74 | 20 | `/calendar-events` + per-event detail URLs. Largest single win. |
| `cltdance.com` | 83 | 45 | 20 | `/event-details-registration/ritmo-latino-…` |
| `tangoclt.com` | 23 | 14 | 13 | `/events` + named event pages |
| `rwlatindance.square.site` | 125 | 0 | 0 | 125 URLs, none matched the event filter |
| `charlottewesties.com` | 22 | 2 | 2 | `/regional-events/`, `/weekend-workshops/` |
| `rwlatindance.com` | 12 | 2 | 2 | `/events-workshops`, `/community-connections` |
| `kizombacharlotte.com` | 0 | 0 | 0 | no sitemap published |
| `thelynnsdanceclub.com` | 0 | 0 | 0 | no sitemap published (the pilot log recorded 1 URL, 0 event pages) |
| `rumbaolatindance.punchpass.com` | 0 | 0 | 0 | no sitemap published |
| **Total** | **372** | **137** | **57** | |

Registry arithmetic:

```
  9   seeded sources            (channel A)
+ 57  sitemap-discovered        (channel B)
= 66  DiscoverySource rows      (verified in the local registry)
```

Six of the nine domains published a sitemap at all — including Square, whose
125 URLs yielded no event pages — and three published none. The Square booking
site is a cheap, honest zero: 125 URLs, no event-signal path, no candidates.

### 4.4 Known limits of sitemap expansion

| Limit | Where | Effect |
|---|---|---|
| Only 20 event pages registered per source | `atlas/cli.ts` → `expand()` → `eventPages.slice(0, 20)` | `afincaodance.com` exposed 74 event pages but contributed 20 registered sources. Raising the cap is a one-line change with an obvious volume implication. |
| At most 5 child sitemaps per index | `atlas/lib/sitemap.ts` → `maxSitemaps = 5` | A large site with many child maps is only partially expanded. |
| Three fixed sitemap paths | `atlas/lib/sitemap.ts` → `read()` | A site publishing only `/sitemap-2026.xml` is invisible to expansion. |
| Filter is a substring test | `looksLikeEventPage()` | `/flights` is a signal, so a site with `/flights` paths can leak false positives; `/blog` protection only covers the listed paths. |
| No discovery of *other domains* | — | Expansion stays inside a domain. A second domain for the same organiser (as with Rumba Latina) must be seeded or found by search. |

---

## 5. Channel C — Keyword search

### 5.1 Query generation

`buildQueries(city, state, styles)` in `atlas/lib/discovery.ts` emits **25
queries per city**: 22 style-specific phrases plus 3 generic ones. Each query
is sent as `"<phrase>" <city> <state>`.

| Style | Phrases emitted | Count |
|---|---|---|
| Salsa | `salsa classes`, `salsa social`, `salsa school` | 3 |
| Bachata | `bachata classes`, `bachata social`, `bachata school` | 3 |
| Tango | `tango milonga`, `tango classes`, `tango practica` | 3 |
| Kizomba | `kizomba classes`, `kizomba social` | 2 |
| Zouk | `zouk classes`, `brazilian zouk social` | 2 |
| West Coast Swing | `west coast swing`, `wcs social` | 2 |
| Ballroom | `ballroom classes`, `ballroom social` | 2 |
| Cumbia | `cumbia classes`, `cumbia social` | 2 |
| Carolina Shag | `carolina shag` | 1 |
| Balboa | `balboa classes` | 1 |
| Country Line Dancing | `country line dancing classes` | 1 |
| Generic | `dance school`, `dance classes calendar`, `social dance events` | 3 |
| | **Total per city** | **25** |

Multiple phrasings per style matter: the phrasing changes which local sites
surface, and a single phrasing per style routinely misses schools that describe
themselves with different words.

### 5.2 The honest finding — free search scraping is not viable

Every free search endpoint tested from this environment returned a bot
challenge, an anomaly page, or no usable results. Re-tested on 2026-11-04 with
the Atlas user agent:

| Endpoint | HTTP | Result |
|---|---|---|
| DuckDuckGo HTML (`html.duckduckgo.com/html/`) | 202 | Anomaly/challenge page, **0** result links |
| DuckDuckGo Lite (`lite.duckduckgo.com/lite/`) | 202 | Anomaly/challenge page, **0** result links |
| Bing HTML (`www.bing.com/search`) | 200 | Blocked/challenge body; no relevant result links |
| Mojeek (`www.mojeek.com/search`) | 200 | Captcha/challenge page, **0** result links |
| Marginalia (`search.marginalia.nu/search`) | 200 | Page rendered, **0** relevant result links |
| searx.be (`searx.be/search`) | 200 | Captcha/challenge page, **0** result links |

The code reflects this: `Discovery.search()` calls `searchSerper()` when
`SERPER_API_KEY` is present and falls back to DuckDuckGo HTML otherwise, and
`discoverCity()` swallows a failed query with a comment that states the rule —
*"A failed query is a gap in coverage, not proof of absence."*

ScrapeGraphAI's own `SearchGraph` does not solve this: it supports only
duckduckgo / bing / searxng / serper, and its rate is hard-coded at 10
searches per minute. At 25 queries per city that is 2.5 minutes of wall clock
per city *before* the bot challenges are considered — and the free backends it
supports are the ones that were just measured as challenged.

**Recommendation:** buy keyword search, but treat it as a supplement, not the
backbone.

| Provider | Indicative price | Cost of one 25-query city sweep |
|---|---|---|
| Serper | ≈ $0.01 / query | ≈ $0.25 per city |
| Brave Search | ≈ $5 / 1,000 requests | ≈ $0.125 per city |

Sitemaps carry the coverage; search fills the gaps that sitemaps cannot reach
(domains nobody has linked to yet, one-off events, organiser sites that publish
no sitemap).

### 5.3 Absence of results is never proof

An empty result set for `"salsa social" Charlotte NC` means the query set is
too narrow — not that Charlotte has no salsa social. The rule is enforced in
code and must be enforced in reporting:

- `discoverCity()` continues to the next query when one fails or returns
  nothing.
- The style list can be widened; the phrase table can be widened; the city
  radius can be widened.
- Atlas reports **source coverage** ("sources registered, sources fresh,
  candidates verified per city"), never event coverage. It never claims to have
  found every event in a city.

---

## 6. Platform exclusions

`isExcludedDomain()` in `atlas/lib/discovery.ts` rejects a hit when the
hostname matches an excluded domain exactly or as a subdomain:

```
facebook.com   instagram.com   twitter.com   x.com          tiktok.com
youtube.com    reddit.com      meetup.com    eventbrite.com yelp.com
wikipedia.org  linkedin.com    pinterest.com amazon.com     ebay.com
etsy.com       google.com      bing.com      duckduckgo.com
```

The reason is policy, not just noise. These platforms hold private groups,
private accounts and non-public content; several require an authenticated
session. Atlas never bypasses authentication, CAPTCHAs or access controls, and
never scrapes non-public content. A dance event announced only on a private
Facebook group is **out of scope by design**, not a gap to be filled.

`eventbrite.com` and `meetup.com` are excluded even though much of their
listing pages are public: they are intermediaries, not the organisers, and a
listing there is a duplicate of the organiser's own page (which is exactly
where the organiser asks to be found).

---

## 7. The style list

Discovery searches for the app's canonical vocabulary, `DANCE_STYLES` in
`src/lib/constants.ts` (identical to `atlas/lib/normalize.ts`):

```
Salsa · Bachata · Cumbia · Kizomba · Zouk · Tango · West Coast Swing
Carolina Shag · Balboa · Ballroom · Country Line Dancing
```

`Other` is the app's fallback bucket and is excluded from discovery queries
(`DANCE_STYLES.filter(s => s !== 'Other')` in `atlas/cli.ts` → `discover`),
because a page that says only "dance" is not a source of style-specific
listings. Style detection at extraction time is deliberately conservative —
`detectStyles()` returns an empty array rather than guessing, and a record
whose only style is `Other` is flagged as a warning in QA.

---

## 8. City prioritisation

A metro is chosen for rollout when it scores well on the criteria below. The
criteria are qualitative and reviewed by hand; the numbers are not invented
measurements.

| Criterion | What is assessed | Why it matters |
|---|---|---|
| Dance community activity | Number and regularity of organised socials, classes and workshops | A city without weekly programming generates nothing to list |
| Number of reliable public sources | Organiser-owned sites, public calendars, published schedules | More sources → more coverage per unit of effort |
| Population | Rough metro size | A proxy for the number of organisers |
| Recurring event availability | Whether a regular weekly/monthly calendar exists | Recurring listings are what a marketplace is for |
| Data freshness | How often the source changes | A stale source needs a slower cadence and yields fewer deltas |
| Source accessibility | robots.txt posture, server-rendered vs JS-rendered, structured data present | Determines which extraction tier works and therefore cost |
| Expected maintenance cost | Crawl frequency × pages per crawl × review load | A city that generates 500 archived listings a month is expensive |

### 8.1 Seeded priority order

Registered by `atlas seed:cities` (`atlas/cli.ts` → `CITIES`):

| Order | City | State | Time zone | Population in seed data | `priority` | `status` |
|---|---|---|---|---|---|---|
| 1 | Charlotte | NC | `America/New_York` | 911,987 | 10 | **ACTIVE** |
| 2 | Raleigh | NC | `America/New_York` | 467,665 | 20 | `PENDING` |
| 3 | Durham | NC | `America/New_York` | 283,506 | 25 | `PENDING` |
| 4 | Atlanta | GA | `America/New_York` | 498,715 | 30 | `PENDING` |
| 5 | Austin | TX | `America/Chicago` | 961,855 | 35 | `PENDING` |
| 6 | Miami | FL | `America/New_York` | 442,241 | 40 | `PENDING` |
| 7 | Chicago | IL | `America/Chicago` | 2,746,388 | 45 | `PENDING` |

Charlotte is `ACTIVE` because it is the pilot city; the other six stay
`PENDING` until the Charlotte acceptance criteria are met. Time zone is stored
per city and drives wall-clock→UTC conversion for every occurrence, so Austin
and Chicago (`America/Chicago`) are handled correctly without special-casing.

---

## 9. Source registry lifecycle

```
  registration
      │  registerSource() — canonical URL, deduped; domain, city, styles,
      │  sourceCategory, discoveredVia, permissionsStatus recorded
      ▼
  first crawl
      │  robots gate → conditional fetch → extraction → QA → dedupe
      │  first success sets lastSuccessAt, contentHash, etag, lastModified
      ▼
  cadence assignment
      │  nextCrawlAt = now + crawlIntervalDays (default 7)
      ▼
  health tracking
      │  extractionSuccessRate, reliability, consecutiveFailures,
      │  lastCrawledAt, lastSuccessAt, robotsStatus, robotsDetail
      ▼
  progressive backoff (on failure)
      │  min(72, 2^min(consecutiveFailures, 6)) hours → 2h, 4h, 8h … 72h cap
      │  a success resets consecutiveFailures to 0
      ▼
  opt-out
         optOut = true → never fetched again; isPaused forced on;
         honoured permanently, never re-litigated
```

Rules that hold across the whole lifecycle:

| Rule | Mechanism |
|---|---|
| robots.txt is a hard gate | `RobotsCache.decide()` → `SKIPPED_BLOCKED`, never fetched |
| Unchanged pages cost nothing | `ETag` / `Last-Modified` conditional request → `SKIPPED_UNCHANGED`; a SHA-256 `contentHash` catches servers that ignore conditional requests |
| One request per domain at a time | `Fetcher.withDomainLock()` + `politenessDelayMs` (2,000 ms default) |
| Bounded response | 20 s timeout, 5 MB byte cap, 2 retries (`DEFAULT_POLICY` in `atlas/lib/types.ts`) |
| Permissions can be revoked | `permissionsStatus: 'DENIED'` → excluded from the scheduler's due-source query in `/api/atlas/tick`, and any candidate it produces is rejected by QA ("Source permissions denied"). Note: the CLI `atlas crawl` filters on `isPaused` and `optOut` only, so an operator running it by hand must also check `permissionsStatus`. |
| A source can be paused | `isPaused` → excluded from the due-source query in `/api/atlas/tick` and in `atlas crawl` |
| Everything can be stopped at once | `atlas kill-switch` / `POST /api/admin/atlas/overview { action: 'pause-all' }` pauses every source |
| Removal requests are honoured | `optOut` is permanent |
| Crawls are idempotent | Candidates are keyed by `(sourceId, dedupeKey)`; re-running updates instead of duplicating |

---

## 10. Operating discovery from the CLI

```bash
# 1. register the rollout cities (7 cities; Charlotte becomes ACTIVE)
npx tsx atlas/cli.ts seed:cities

# 2. register the 9 seed sources for a city
npx tsx atlas/cli.ts seed:sources --city charlotte-nc

# 3. expand every source of a city through its own sitemap  ← primary channel
npx tsx atlas/cli.ts expand --city charlotte-nc

# 4. keyword discovery for a city (needs SERPER_API_KEY; free fallback is
#    bot-challenged — see §5.2)
npx tsx atlas/cli.ts discover --city charlotte-nc

# 5. crawl what is due (--force ignores the schedule, --limit N bounds it)
npx tsx atlas/cli.ts crawl --force --limit 70

# 6. inspect
npx tsx atlas/cli.ts sources        # registry with robots status and cadence
npx tsx atlas/cli.ts review         # candidate review queue (--all for rejects)
npx tsx atlas/cli.ts report         # coverage + quality funnel
```

The scheduler equivalent is `GET /api/atlas/tick` (Vercel Cron), which selects
sources where `nextCrawlAt <= now`, `isPaused = false`, `optOut = false` and
`permissionsStatus != 'DENIED'`, then writes `CrawlJob` rows for the worker to
drain.

---

## 11. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-ARCHITECTURE.md` | System shape, extraction ladder, scheduling policy |
| `ATLAS-COST-MODEL.md` | What discovery and extraction cost, per scenario |
| `ATLAS-PILOT-CHARLOTTE.md` | Charlotte pilot results and acceptance criteria |
| `atlas/README.md` | Developer quick reference for the local PoC |
| `atlas/lib/discovery.ts` | Query generation, search providers, domain exclusions |
| `atlas/lib/sitemap.ts` | Sitemap parsing and the event-page filter |
| `atlas/lib/robots.ts` | robots.txt gate and on-disk cache |
| `atlas/lib/fetcher.ts` | Politeness, conditional requests, byte cap |
| `atlas/cli.ts` | `seed:cities`, `seed:sources`, `expand`, `discover`, `crawl` |
