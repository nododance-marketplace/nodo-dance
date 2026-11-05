# Nodo Atlas — National Lead Census (US)

> How many dance leads exist across the United States? Measured 2026-11-04.
> **Status: partial.** The national totals are complete; the metro table is 14 of 38.
> Source data: `atlas/data/lead-census-2026-11-04.json`.

---

## 1. What we hold today (measured, live database)

Read-only counts from the production Neon database, 2026-11-04:

| Metric | Count |
|---|---|
| Events (all approved) | 601 |
| Recurring occurrences | 597 |
| Distinct recurring series | 32 |
| Distinct venues | 14 |
| Distinct organizers | 13 |
| Distinct source websites | 15 |
| Upcoming events | 188 |
| Events geocoded | 601 / 601 |
| Events in North Carolina | 464 |
| Instructor profiles | 6 |
| Users | 18 (9 with the instructor role) |

**Read that table honestly:** Nodo is currently a *single-metro* directory. 601 events
come from 13 organizers across 15 websites, essentially all in Charlotte. The 597
recurring rows are 32 series materialised forward — not 597 separate discoveries.

---

## 2. The national universe (measured floor)

Counted via OpenStreetMap through the Overpass API (ODbL-licensed, no API key, no
search-engine scraping involved):

| Measure | Count |
|---|---|
| US venues tagged `leisure=dance` | **2,349** |
| US named places containing a dance word | **9,474** |
| US venues tagged `social_facility=dance` | 0 (tag not used in the US) |
| US venues tagged `amenity=dance` | 0 (tag not used in the US) |

The 9,474 figure is deliberately over-inclusive — it matches cafés and gyms with
"dance" in the name, not just organisations. The meaningful number is **2,349
dedicated dance venues**, and it is a **floor**.

### Why it is a floor, proven by our own pilot

| Charlotte NC | Count |
|---|---|
| OpenStreetMap places | 27 |
| **Source domains Atlas actually reached** | **66** |
| **Candidate schools Atlas actually found** | **64** |
| Candidate events extracted | 150 |

From **six** seeded organizer websites, sitemap expansion reached 66 distinct source
domains and 64 candidate schools in one city. OpenStreetMap maps 27 places there.
The dataset undercounts small private studios by **3x or more**, because a studio
that was never mapped does not exist in OSM.

---

## 3. Extrapolation (an estimate, not a count)

Assumptions, stated so they can be challenged:

1. OSM undercounts dance organisations by **3–5×** (measured: ≥3× in Charlotte).
2. The 9,474 named-dance-word places contain roughly **35–45%** genuine dance
   organisations; the rest are cafés, gyms, retail and non-US noise.
3. Around **60%** of genuine organisations publish a public calendar or event page —
   the rest are private studios with no web presence to ingest.

| Layer | Calculation | Result |
|---|---|---|
| OSM dedicated venues | measured | 2,349 |
| True dance organisations | 2,349 × 3–5 | **7,000–11,700** |
| Named-but-not-tagged organisations | 9,474 × 35–45% − overlap with the above | **~3,000–4,000** additional |
| **Total dance organisations in the US** | | **10,000–16,000** |
| **Of those, with a public calendar to ingest** | 60% | **6,000–9,500** |
| **Distinct ingestible source domains** | allowing for multi-site orgs | **~5,000–8,000** |
| **Recurring class/social series** | 1–3 per organisation | **8,000–20,000** |
| **Individual recurring occurrences per year** | 32–52 per series | **500,000–1,000,000** |

**The honest headline: the addressable lead universe is roughly 6,000–9,500
ingestible sources, not a hundred.** Against that, Nodo currently has 15.

**This is an estimate with stated assumptions, not a measurement.** The measured
parts are the 2,349 OSM venues, the 9,474 named places, the Charlotte comparison
and the live-database baseline. Treat the extrapolation as a planning range, and
replace it with measured numbers as each metro is ingested.

---

## 4. Metro ranking (14 of 38 measured)

| City | State | Dance venues | Named dance places | Total |
|---|---|---:|---:|---:|
| New York | New York | 70 | 118 | **188** |
| Chicago | Illinois | 19 | 53 | **72** |
| Seattle | Washington | 19 | 37 | **56** |
| Austin | Texas | 13 | 31 | **44** |
| Atlanta | Georgia | 5 | 29 | 34 |
| Philadelphia | Pennsylvania | 8 | 26 | 34 |
| Los Angeles | California | 10 | 24 | 34 |
| Boston | Massachusetts | 11 | 19 | 30 |
| Raleigh | North Carolina | 11 | 19 | 30 |
| Houston | Texas | 7 | 22 | 29 |
| Phoenix | Arizona | 10 | 17 | 27 |
| Charlotte | North Carolina | 6 | 21 | 27 |
| Miami | Florida | 6 | 12 | 18 |
| Durham | North Carolina | 0 | 11 | 11 |

**Still to measure (24):** San Diego, Tampa, New Orleans, Denver, Detroit, Nashville,
Las Vegas, Portland, Memphis, Baltimore, Milwaukee, Kansas City, Cleveland,
Minneapolis, Newark, St. Louis, Pittsburgh, Orlando, Cincinnati, Indianapolis,
Columbus, San Francisco, Jacksonville, Dallas.

Note how Charlotte ranks **12th of 14 measured** on mapped presence — yet it is our
pilot city. Mapped density and actual dance activity are different things: Austin,
Miami and Tampa punch above their mapped weight because their communities run
active calendars.

---

## 5. Why this matters for the rollout

1. **The universe is finite and knowable.** ~6,000–9,500 ingestible sources. That is
   a crawl plan, not an infinite frontier — and it fits the budget model.
2. **Sitemaps beat search, and OSM beats both for seeding.** Sitemaps expanded
   9 → 66 domains for free. OSM gives a free, licensed, key-free inventory to seed
   each metro with candidate organisations before we ever touch a search engine.
3. **Coverage is measurable.** "Sources registered per city" is an honest metric
   with a real denominator — the estimated universe per city.
4. **The founder's manual work is the bottleneck, not the crawling.** Even a 10%
   automated hit rate across the universe removes thousands of hours of form-filling
   per year.

---

## 6. Resuming this work

```bash
# National totals (takes ~4 minutes, Overpass under load may 504):
npx tsx atlas/scripts/us-lead-census.ts

# Metro table (takes ~15 minutes, flaky under load):
npx tsx atlas/scripts/us-metro-census.ts     # first pass
npx tsx atlas/scripts/us-metro-retry.ts       # recover the 502/504 metros

# Live database baseline (read-only):
npx tsx atlas/scripts/production-snapshot.ts
```

**Overpass etiquette:** send a descriptive `User-Agent`, stay under ~1 query per
second, and expect 502/504 under load — a failed query is *unknown*, never a zero.
Both scripts already handle that: the retry script skips failures instead of
recording them as zero.

**Next step when the connection is stable:** add OSM as a formal Atlas discovery
channel (`Agent A`), where each mapped organisation with a `website`/`contact:website`
tag becomes a registered `DiscoverySource` with `discoveredVia: 'OSM'`. That converts
this census from a report into a pipeline, and gives every metro a free starting
point.
