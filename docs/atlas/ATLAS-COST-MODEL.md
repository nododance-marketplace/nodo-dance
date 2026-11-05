# Nodo Atlas — Cost Model

> Cost model for Nodo Atlas: what the pipeline costs per page, per city and per
> rollout stage. Last updated: 2026-11-04.
> **Measured headline: the Charlotte pilot cost $0.** Every number below is
> either a measured pilot result or an explicitly labelled estimate with its
> arithmetic shown.
> Companion documents: `ATLAS-DISCOVERY.md`, `ATLAS-PILOT-CHARLOTTE.md`,
> `ATLAS-ARCHITECTURE.md`.

---

## 1. Summary

| Question | Answer | Basis |
|---|---|---|
| What did the Charlotte pilot cost? | **$0** | Measured — every `CrawlAttempt.costUsd` is 0 |
| What is the cheapest extraction path? | Deterministic tiers 0–3 (feeds, JSON-LD, iCal, HTML scan) | Measured — the pilot never called an LLM |
| What does hosted LLM extraction cost? | $0.45–$2.24 per 1,000 pages (raw tokens) or $3.33–$10.00 per 1,000 pages (ScrapeGraphAI Extract) | Model prices, arithmetic in §3 |
| What does the workforce cost? | 7.5 review-hours per 1,000 candidates | **Estimate** — 40/hour review rate, 30% pass rate (§7) |
| What dominates? | **Human review time, not token spend** | §7 |

The economic shape of Atlas is unusual: extraction is nearly free, and the bill
is paid in reviewer attention. Every design decision that follows from that.

---

## 2. What the Charlotte pilot actually cost

**Measured, not estimated: $0.**

| Item | Pilot result |
|---|---|
| Extraction tiers used | 1 (JSON-LD) and 3 (deterministic HTML scan) — 34 and 9 extractions respectively. Tiers 0 (RSS) and 2 (iCalendar) were available but no feed or `.ics` endpoint was found on the pilot sources |
| LLM calls made | 0 |
| `CrawlAttempt.costUsd` written | 0 on every attempt |
| `CrawlJob.costUsd` written | 0 on every job |
| Paid APIs called | 0 (no `SERPER_API_KEY` set, no paid geocoder) |
| Sources registered | 66 (9 seeded + 57 via sitemap expansion) |
| Candidates extracted | 95 |
| Pages fetched | ~165 successful + 72 skipped-unchanged |

The code path is why the number is exactly zero: `atlas/lib/pipeline.ts` sets
`costUsd: 0` on every `CrawlOutcome` because no tier above 3 was reached. The
column exists for the future LLM sidecar; until the sidecar exists, zero is
the truth.

The consequence is that **the marginal cost of another Charlotte-sized city is
also $0** for the deterministic tier — the only new costs are machine time and
human review.

---

## 3. Extraction unit economics

Two ways to buy extraction: hosted (ScrapeGraphAI credits) or raw tokens
through a model API.

### 3.1 ScrapeGraphAI hosted — Extract tier

Extract consumes **5 credits per page**.

| Plan | Price | Credits | $ per 1,000 credits | Credits per 1,000 pages | **Cost per 1,000 pages** |
|---|---|---|---|---|---|
| Starter | $20 | 10,000 | $2.00 | 5,000 | **$10.00** |
| Growth | $100 | 100,000 | $1.00 | 5,000 | **$5.00** |
| Pro | $500 | 750,000 | $0.667 | 5,000 | **$3.33** |

Arithmetic, Growth: $100 ÷ 100,000 credits = $0.001 per credit; 5 credits ×
1,000 pages = 5,000 credits; 5,000 × $0.001 = **$5.00**.
Pro: $500 ÷ 750,000 = $0.000667 per credit; 5,000 × $0.000667 = **$3.33**.
Starter: $20 ÷ 10,000 = $0.002 per credit; 5,000 × $0.002 = **$10.00**.

> Note: the pilot brief quotes "$13.00/1k" for Starter. That figure does not
> reconcile with the same brief's plan prices — $2.00 per 1,000 credits × 5
> credits per page × 1,000 pages = $10.00. The table above shows the arithmetic
> so the number can be re-derived and re-checked against the vendor's live
> pricing before purchase.

### 3.2 Raw tokens for an equivalent extraction

Assumption: one page costs **12,500 input tokens + 600 output tokens** to
extract into the same structured record. Prices are per **1,000,000 tokens**.

Per-page cost = (12,500 ÷ 1,000,000) × input rate + (600 ÷ 1,000,000) × output rate.

| Model | In / Out per 1M tokens | Per-page arithmetic | **Cost per 1,000 pages** |
|---|---|---|---|
| `gpt-oss-20b` | $0.03 / $0.13 | 0.0125×0.03 + 0.0006×0.13 = $0.000453 | **$0.45** |
| `gpt-5-nano` | $0.05 / $0.40 | 0.0125×0.05 + 0.0006×0.40 = $0.000865 | **$0.87** |
| Groq `gpt-oss-20b` | $0.075 / $0.30 | 0.0125×0.075 + 0.0006×0.30 = $0.0011175 | **$1.12** |
| Claude Haiku 5.5 | $0.10 / $0.50 | 0.0125×0.10 + 0.0006×0.50 = $0.00155 | **$1.55** |
| `gpt-4o-mini` | $0.15 / $0.60 | 0.0125×0.15 + 0.0006×0.60 = $0.002235 | **$2.24** |

Even the most expensive row — `gpt-4o-mini` at $2.24 per 1,000 pages — costs
about a quarter of a US cent per page. Token price is not a constraint at
any plausible scale.

### 3.3 Small LLM classification only

Assumption: **250 input tokens + 60 output tokens** to classify one candidate
(style / event type judgement on a short snippet), no extraction.

| Model | Per-page arithmetic | **Cost per 1,000 pages** |
|---|---|---|
| `gpt-5-nano` | 0.00025×0.05 + 0.00006×0.40 = $0.0000365 | **$0.04** |
| Groq `gpt-oss-20b` | 0.00025×0.075 + 0.00006×0.30 = $0.00003675 | **$0.04** |
| Claude Haiku 5.5 | 0.00025×0.10 + 0.00006×0.50 = $0.000055 | **$0.06** |

### 3.4 Deterministic parsing + a container

No API spend; the cost is the machine that runs the worker.

| Container price | Pages/month | **Cost per 1,000 pages** |
|---|---|---|
| $12/mo | 20,000 | $0.60 |
| $20/mo | 20,000 | $1.00 |
| $12/mo | 10,000 | $1.20 |
| $20/mo | 10,000 | $2.00 |
| $12/mo | 75,000 | $0.16 |
| $20/mo | 75,000 | $0.27 |

The working figure used below is **$0.60–$1.20 per 1,000 pages** (a $12–20
container at 10,000–20,000 pages/month). It amortises further as volume
grows — at mature scale the container is effectively free per page.

### 3.5 The ladder, priced

| Tier | Method | Cost per 1,000 pages | Pilot usage |
|---|---|---|---|
| 0 | RSS / Atom feed | $0.00 | 0 pages |
| 1 | JSON-LD (`schema.org/Event`) | $0.00 | 34 extractions |
| 2 | iCalendar (`.ics`) | $0.00 | 0 pages |
| 3 | Deterministic HTML scan | $0.00 (CPU only) | 9 extractions |
| 4 | Small LLM classification | $0.04–$0.06 | not used |
| 5 | LLM structured extraction | $0.45–$2.24 | not used |
| 6 | ScrapeGraphAI Extract | $3.33–$10.00 | not used |

The pilot sat entirely in tiers 1 and 3. That is the whole cost story.

---

## 4. Fixed and auxiliary costs

| Item | Cost | Note |
|---|---|---|
| Atlas worker host | $5–6/month (Fly.io / Railway / small VPS) | $0 if it runs on an existing box |
| Crawl container | see §3.4 | Also the worker host on the smallest plan |
| Search API (Serper) | ≈ $0.01/query | See §4.2 |
| Geocoding (Nominatim) | $0 | Free, 1 request/second policy |
| Postgres (Neon) | within the existing plan | Atlas tables are additive; no new database |

### 4.1 Geocoding arithmetic

Nominatim is free but rate-limited to **1 request per second**. The app
geocodes on approval via `src/lib/geocode.ts`, which may issue a second lookup
with a sanitised address if the first fails — budget 2 requests per address.

```
  1,000 geocodes × 1 request/second = 1,000 seconds = 16.7 minutes   → $0
  2,000 listings × 2 requests        = 4,000 seconds = 66.7 minutes  → $0
```

Even the mature scenario needs about one hour of geocoding per month, spread
over a month. There is no reason to buy a paid geocoder.

### 4.2 Search API arithmetic

`buildQueries()` emits **25 queries per city** (22 style phrases + 3 generic);
the planning figure used here is 30 queries per city per discovery run to
allow for widening the phrase set.

```
  50 cities × 30 queries = 1,500 queries × $0.01 = $15.00 per full sweep
  50 cities × 25 queries = 1,250 queries × $0.01 = $12.50 per full sweep

  200 cities × 30 queries = 6,000 queries × $0.01 = $60.00 per full sweep
```

At a monthly sweep this is $15/month at 50 cities and $60/month at 200 cities —
the first cost in the model that scales linearly with the number of cities.

---

## 5. Three scenarios

### 5.1 PILOT — Charlotte

| Parameter | Value | Derivation |
|---|---|---|
| Cities | 1 | Charlotte |
| Sources | 70 | 66 registered + headroom |
| Cadence | weekly | `crawlIntervalDays = 7` default |
| Source-crawls/month | 301 | 70 × 4.3 |
| Page fetches/month | ~750 | 301 × 2.5 fetches per source-crawl (pilot measured 165 fetches ÷ 66 sources) |
| **Pages actually extracted** | **~500** | 752 fetches × the pilot's changed rate (165 changed of 237 attempts = 70%) ≈ 525 |

| Cost line | Monthly |
|---|---|
| Extraction (tiers 0–3) | $0.00 |
| LLM classification (tier 4) on 500 pages | $0.02 |
| LLM extraction (tier 5) | $0.00 — not used |
| ScrapeGraphAI (tier 6) | $0.00 — not used |
| Crawl container (amortised) | $0.30 – $0.60 |
| Worker host | $0 (existing box) – $6 |
| Search API (one-off sweep) | $0.25 – $0.30 |
| Geocoding | $0.00 |
| **Total** | **$0.57 – $6.92 → planning target $0–5/month** |

### 5.2 EARLY NATIONWIDE — 50 cities

| Parameter | Value | Derivation |
|---|---|---|
| Cities | 50 | |
| Sources | 600 | ~12 sources per city |
| Cadence | weekly | |
| Source-crawls/month | 2,580 | 600 × 4.3 |
| Pages/month | 15,000 | 2,580 × ~5.8 pages per source-crawl |

> Assumption flagged: the pilot's measured rate is ~2.5 fetches per
> source-crawl, which would give 6,450 pages/month. The 15,000 figure assumes a
> higher average (5.8 pages per source-crawl) once calendar indexes with many
> dated listings are in the mix. We plan against the higher number.

| Cost line | Low configuration | Conservative configuration |
|---|---|---|
| Extraction (tiers 0–3) | $0.00 | $0.00 |
| LLM classification (tier 4), all pages | $0.60 | $0.60 |
| LLM extraction (tier 5), 10% of pages (1,500) | $0.68 | $3.36 |
| ScrapeGraphAI Extract (tier 6), 5% of pages (750) | $2.50 | $7.50 |
| Crawl container (15,000 pages @ $0.80–$1.33 per 1k) | $12.00 | $20.00 |
| Worker host | $5.00 | $6.00 |
| Search API (50 cities, monthly sweep) | $12.50 | $15.00 |
| Geocoding | $0.00 | $0.00 |
| **Total** | **$33.28** | **$52.46** |

The deterministic-only configuration (no tier 5 or 6) is $30–42/month, which
sits inside the **$15–40/month** planning band. The upper figure appears only
when the LLM long tail and a $20/month container are both switched on.

**Unit economics at this scale**

| Per 1,000 pages | Low | Conservative |
|---|---|---|
| Deterministic extraction | $0.00 | $0.00 |
| Container amortised | $0.80 | $1.33 |
| Classification | $0.04 | $0.04 |
| Extraction, if 100% went to LLM | $0.45 | $2.24 |
| Extraction, if 100% went to ScrapeGraphAI | $3.33 | $10.00 |

### 5.3 MATURE — 200 cities

| Parameter | Value | Derivation |
|---|---|---|
| Cities | 200 | |
| Sources | 2,500 | ~12.5 sources per city |
| Cadence | weekly | |
| Source-crawls/month | 10,750 | 2,500 × 4.3 |
| Pages/month | 75,000 | 10,750 × ~7 pages per source-crawl |
| Candidates/month | ~15,000 | 2,500 sources × 1.4 candidates per source-crawl (pilot ratio: 95 candidates ÷ 66 sources = 1.44) × 4.3 weekly crawls |

| Cost line | Low | Conservative |
|---|---|---|
| Extraction (tiers 0–3) | $0.00 | $0.00 |
| LLM classification (tier 4), 75,000 pages | $3.00 | $3.00 |
| LLM extraction (tier 5), 10% (7,500 pages) | $3.38 | $16.80 |
| ScrapeGraphAI Extract (tier 6), 5% (3,750 pages) | $12.50 | $37.50 |
| Crawl container (75,000 pages @ $0.16–$0.27 per 1k) | $12.00 | $20.00 |
| Worker host | $5.00 | $6.00 |
| Search API (200 cities, monthly sweep) | $50.00 | $60.00 |
| Geocoding (4,000 requests) | $0.00 | $0.00 |
| **Total** | **$85.88** | **$143.30** |

That is **≈ $86–143/month**, inside the $60–150/month planning band, plus any
additional long-tail spend if the JS-rendered share grows beyond 5%.

**Unit economics at this scale**

| Per 1,000 pages | Low | Conservative |
|---|---|---|
| Deterministic extraction | $0.00 | $0.00 |
| Container amortised | $0.16 | $0.27 |
| Classification | $0.04 | $0.04 |
| Extraction, if 100% went to LLM | $0.45 | $2.24 |
| Extraction, if 100% went to ScrapeGraphAI | $3.33 | $10.00 |

### 5.4 Side-by-side

| | PILOT | EARLY NATIONWIDE | MATURE |
|---|---|---|---|
| Cities | 1 | 50 | 200 |
| Sources | 70 | 600 | 2,500 |
| Pages/month | ~500 | ~15,000 | ~75,000 |
| Search API/month | $0 (one-off) | $12.50 – $15.00 | $50 – $60 |
| Container/month | $0.30 – $0.60 | $12 – $20 | $12 – $20 |
| Worker/month | $0 – $6 | $5 – $6 | $5 – $6 |
| LLM long tail/month | $0 | $3 – $11 | $19 – $57 |
| **Total/month** | **$0.57 – $6.92** | **$33 – $52** | **$86 – $143** |
| Planning band | **$0 – $5** | **~$15 – $40** | **~$60 – $150** |
| Review hours/month (§7) | ~3 h | ~27 h | ~113 h |

---

## 6. Monthly spending cap and alerting

### 6.1 Where the numbers live

| Field | Model | Current behaviour |
|---|---|---|
| `CrawlAttempt.costUsd` | `Float @default(0)` | Written as 0 by the deterministic path — correct today, must be written by the LLM sidecar when it exists |
| `CrawlJob.costUsd` | `Float @default(0)` | Same; one value per job |
| `DiscoverySource.crawlIntervalDays` | `Int @default(7)` | The cadence dial |
| `DiscoverySource.isPaused` | `Boolean` | Excluded from the due-source query in `/api/atlas/tick` |
| `DiscoverySource.optOut` | `Boolean` | Permanent exclusion |

### 6.2 Rollups

```
  per source   = SUM(CrawlAttempt.costUsd)
                 GROUP BY CrawlJob.sourceId

  per city     = SUM(CrawlAttempt.costUsd)
                 GROUP BY DiscoverySource.cityId

  per day      = SUM(CrawlAttempt.costUsd)
                 WHERE CrawlAttempt.createdAt >= now() - 24h

  month-to-date= SUM(CrawlAttempt.costUsd)
                 WHERE CrawlAttempt.createdAt >= first of month
```

### 6.3 Alerting and the hard ceiling

| Threshold | Action |
|---|---|
| Day-to-date > 25% of the monthly cap | Warn (Slack/email): the daily run is burning budget early |
| Week-to-date > 60% of the monthly cap | Warn + pause the single highest-cost city |
| Month-to-date ≥ 100% of the cap | **Hard stop.** Set `isPaused = true` on every source (the existing kill switch) and stop scheduling |
| Any single source > 10× the per-source median | Pause that source, inspect it |
| Any source with `costUsd` > 0 on 3 consecutive days | Flag for review — a deterministic source should never cost anything |

The hard ceiling is enforced *before* work starts, not after: `/api/atlas/tick`
already selects only sources where `isPaused = false` and `optOut = false`, so
pausing every source removes them from the next scheduling pass automatically.
The same check must also sit at the top of the worker's own loop, because a
worker draining `CrawlJob` rows bypasses the tick endpoint.

Configuration is environment-driven:

```
  ATLAS_MONTHLY_CAP_USD   = 40     # early nationwide ceiling
  ATLAS_CAP_ALERT_PCT     = 25     # daily warning threshold
  ATLAS_CAP_PAUSE_PCT     = 60     # weekly pause threshold
```

A cap of $40/month is roughly 1.2× the early-nationwide low configuration
($33.28) — a deliberately thin margin, because the machine bill is small and a
runaway should be visible before it happens. The conservative configuration
($52.46) would require raising the cap, which should be a deliberate decision,
not a default. The cap is a ceiling on *machine* spend only; review labour is
tracked separately (§7).

---

## 7. The dominant cost is human review time

Everything above is machine spend. The real bill is reviewer attention.

### 7.1 The arithmetic (estimate)

Assumptions, stated so they can be argued with:

- A reviewer gets through **40 candidates per hour** (reading the listing,
  checking the source, deciding).
- **30% of extracted candidates reach the review queue** — the QA gate rejects
  the rest.

```
  1,000 candidates extracted
    → 300 reach the queue          (30% pass rate)
    → 300 ÷ 40 candidates/hour     = 7.5 review-hours per 1,000 candidates
```

At the mature scale (§5.3), ~15,000 candidates/month:

```
  15,000 × 30%                       = 4,500 candidates in the queue
  4,500 ÷ 40 candidates/hour         = 112.5 review-hours per month
                                     ≈ 2.8 full working weeks
```

One Charlotte-sized metro is about 3 review-hours per month
(70 sources × 1.4 candidates × 4.3 crawls × 30% ÷ 40 = 3.2 hours). Fifty
such metros would be 160 hours; the 50-city scenario lands at ~27 hours
because its sources are smaller and yield fewer candidates each.

### 7.2 Why noise reduction beats token reduction

Take the measured pilot. 95 candidates were extracted; QA let 29 through as
`PASS` and 6 through as `QUARANTINE`; 60 were rejected as archived listings.

```
  With the QA gate:    35 candidates reviewed  → 35 ÷ 40 = 0.9 review-hours
  Without the QA gate: 95 candidates reviewed  → 95 ÷ 40 = 2.4 review-hours

  Review work avoided: 1.5 hours per source sweep, for $0 of extra spend.
```

The same sweep on an LLM path would have cost 95 pages × $0.87/1k = $0.08.
Trading a $0.08 saving for 1.5 hours of reviewer time is a losing trade by
three orders of magnitude.

Scaling the comparison, using an assumed loaded reviewer cost of $25/hour
(**assumption, not a measured Nodo figure**):

| | Per 1,000 candidates |
|---|---|
| Extraction at the cheapest LLM rate (`gpt-oss-20b`, $0.45/1k) | $0.45 |
| Extraction at the dearest LLM rate (`gpt-4o-mini`, $2.24/1k) | $2.24 |
| Review: 7.5 hours × $25/hour | $187.50 |

Review is roughly **84× to 417× the extraction cost**, depending on the model.
The only lever that matters is the ratio of useful candidates to reviewed
candidates.

### 7.3 What that implies for the pipeline

| Priority | Consequence |
|---|---|
| 1 | Keep the QA gate strict. Rejecting an archived listing before a human sees it is worth more than any model choice. |
| 2 | Prefer deterministic extraction. It is free, and it does not spend reviewer attention on a malformed record. |
| 3 | Spend LLM tokens only where deterministic extraction produced nothing, never "to make the model do a better job". |
| 4 | Prefer one source that publishes 40 dated listings to 40 sources that publish one. The first costs one fetch per listing; the second costs 40 fetches and 40 reviewer decisions. |
| 5 | Measure the queue ratio, not the token bill. The metric that predicts cost is `candidates reaching the queue ÷ candidates extracted`. |

---

## 8. What would change these numbers

| Trigger | Effect |
|---|---|
| JS-rendered share rises above 5% of pages | The tier-6 line grows from $12.50 to whatever the real share is. At 25% of 75,000 pages on a Pro plan: 18,750 pages × $3.33/1k = $62.50/month |
| Cadence moves from weekly to daily | Page count multiplies by ~7; the container cost dominates, not tokens |
| The search sweep runs weekly instead of monthly | 200 cities: $60/month becomes 4.3 × $60 = $258/month |
| Review rate is 20/hour instead of 40 | Review hours double: 225 hours/month at mature scale |
| The QA gate's recall drops (rejects a good listing) | The missed listing is invisible in the cost model and visible on the site. Track QA rejections by hand (see `ATLAS-PILOT-CHARLOTTE.md` §7) |

---

## 9. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-DISCOVERY.md` | How sources are found; the sitemap expansion results |
| `ATLAS-PILOT-CHARLOTTE.md` | The measured pilot: 66 sources, 95 candidates, $0 |
| `ATLAS-ARCHITECTURE.md` | Extraction ladder, scheduling, failure modes |
| `atlas/lib/pipeline.ts` | Where `costUsd` is written (currently always 0) |
| `atlas/lib/types.ts` | `DEFAULT_POLICY` — timeout, byte cap, politeness delay |
| `prisma/schema.prisma` | `CrawlJob.costUsd`, `CrawlAttempt.costUsd` |
| `src/lib/geocode.ts` | Nominatim usage and the 1 request/second budget |
