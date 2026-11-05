# Nodo Atlas — ScrapeGraphAI Feasibility Assessment

> Evaluation of [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai)
> as the extraction engine for Nodo Atlas. Last updated: 2026-11-04.
> **Verdict: keep it for the long tail. Do not build the pipeline around it.**

---

## 1. Summary

ScrapeGraphAI is a well-maintained, MIT-licensed, genuinely capable library. It is
the wrong *default* for a cost-minimising ingestion pipeline, for three reasons found
in the source:

1. **The hosted API is expensive for structured extraction.** `Extract` costs
   **5 credits per page**. At our pilot scale that is $5.00 per 1,000 pages, against
   **$0.60–1.20** for deterministic parsing and **$0.87** for the same extraction
   done with a cheap model directly.
2. **The OSS fetch path launches a fresh headless Chromium per URL.** There is no
   browser pooling. `use_soup` (a plain `requests.get` escape hatch) exists in
   `FetchNode` but is **not plumbed through `SmartScraperGraph`'s config**, so you
   pay browser CPU and RAM on every page unless you patch the library.
3. **The multi-graph output shape is wrong for ingestion.** `SmartScraperMultiGraph`
   ends in a merge node and returns **one merged answer**, not a list of per-page
   records. An ingestion pipeline needs one row per source.

None of this makes ScrapeGraphAI bad. It makes it the *wrong tier* for most pages.

---

## 2. Current state of the library

| Item | Finding |
|---|---|
| Version | **2.3.1**, released 2026-10-06 |
| License | MIT (commercial use permitted) |
| Python | **3.12+ only** — the shipped `Dockerfile` still pins `python:3.11-slim` and is broken for 2.3.1 |
| Maintenance | Active — roughly monthly minor releases through 2026 |
| Telemetry | On by default; opt out with `SCRAPEGRAPHAI_TELEMETRY_ENABLED=false` |
| Dependencies | `langchain`, `playwright`, `undetected-playwright`, `beautifulsoup4`, `scrapegraph-py` (the hosted SDK ships inside the OSS package) |

---

## 3. Capability matrix

| Capability | SGAI OSS | SGAI hosted | What Atlas uses instead |
|---|---|---|---|
| Structured extraction (Pydantic schema) | Yes | Yes (`Extract`, 5 credits/page) | Deterministic parsers + JSON-LD |
| Deterministic extraction without an LLM | Lite graph only | Monitor engine | `atlas/lib/parsers/` — free |
| Bring your own model | 19+ providers | No | — |
| Fully local model (Ollama) | Yes | No | — |
| JavaScript rendering | Playwright, **new browser per URL** | Managed | Not yet needed |
| Anti-bot / stealth | Built in (`Malenia`) | Managed (+5 credits) | — |
| Scheduled monitoring + webhooks | No | **Yes** (`Monitor`) | `/api/atlas/tick` + own scheduler |
| Multi-page crawl | In-process | Yes (async, resumable) | Sitemap-driven expansion |
| HTTP caching | No | No | ETag/Last-Modified + content hash |
| Per-domain rate limiting | No | No | Implemented in `atlas/lib/fetcher.ts` |
| Robots.txt handling | Partial | No | Implemented as a hard gate |
| Retry / backoff | LLM only; fetch default is **1 attempt** | Yes | Implemented with backoff |
| Output shape for N pages | One merged answer (wrong) | Per-request | One row per source |
| Cost per 1,000 pages (structured) | $0.45–$2.24 + infra | **$3.33–$15.00** | **$0.60–$1.20** |

---

## 4. Cost analysis

### Hosted API

`Extract` = 5 credits/page.

| Plan | Monthly | Credits | $/1k credits | Cost per 1,000 pages |
|---|---|---|---|---|
| Starter | $20 | 10,000 | $2.00 | **$10.00** |
| Growth | $100 | 100,000 | $1.00 | **$5.00** |
| Pro | $500 | 750,000 | $0.667 | **$3.33** |
| Top-up | $3–5/1k | — | — | $15.00–$25.00 |

Stealth rendering adds 4–9 credits per page and roughly doubles the bill.

### Self-hosted with a cheap model

Assumption: 12,500 input tokens + 600 output tokens per page (a cleaned page is
~50,000 characters; the graph does one extraction call plus one merge call).

| Model | $/1M in | $/1M out | Cost per 1,000 pages |
|---|---|---|---|
| `gpt-oss-20b` | $0.03 | $0.13 | **$0.45** |
| `gpt-5-nano` | $0.05 | $0.40 | **$0.87** |
| Groq `gpt-oss-20b` | $0.075 | $0.30 | **$1.12** |
| Claude Haiku 5.5 | $0.10 | $0.50 | **$1.55** |
| `gpt-4o-mini` | $0.15 | $0.60 | **$2.24** |

Two traps multiply these numbers:

- **The 8192-token fallback.** `helpers/models_tokens.py` is stale relative to the
  current model line-up. An unlisted model silently falls back to 8,192 tokens,
  splitting a long page into ~7 chunks → ~1.4× input and ~4× output cost, and
  worse accuracy. **Always set `config["llm"]["model_tokens"]` explicitly.**
- **Markdown conversion is OpenAI-only.** With Anthropic, Gemini, Groq, DeepSeek or
  Ollama you get raw HTML unless you set `config={"force": True}`.

### Deterministic parsing (what Atlas actually does)

| Component | Cost |
|---|---|
| Worker container ($6/mo) | $0.60–1.20 per 1,000 pages |
| Bandwidth (~100 KB/page) | < $1/mo |
| LLM calls | **$0** |
| **Measured Charlotte pilot** | **$0.00** |

---

## 5. Search discovery

`SearchGraph` supports exactly four engines: `duckduckgo`, `bing`, `searxng`, `serper`.
Google, Brave and Tavily are **not** directly supported (Brave is reachable only
through a self-hosted SearXNG). There is also a hard-coded limit of **10 searches
per minute**.

**Pilot finding:** from this environment, every free engine returned a bot challenge,
an anomaly page, or nothing usable — DuckDuckGo HTML and Lite returned anomaly
pages (HTTP 202), Bing and Mojeek and searx.be returned captchas, Marginalia
returned no relevant results. Free search scraping is not viable.

**Recommendation:** use sitemaps for the bulk of discovery (they cost nothing and
produced 57 additional candidate sources from 9 known domains in the pilot), and
buy keyword discovery — Serper at roughly $0.01 per query — for the gaps.

---

## 6. Where ScrapeGraphAI genuinely earns its cost

| Situation | Why the managed service wins |
|---|---|
| JS-rendered listings | Atlas's deterministic pass returns nothing for Punchpass, Square and similar builders. A browser tier is required. |
| Anti-bot walls | Managed proxy rotation and stealth beat a self-hosted browser fleet at small scale. |
| `Monitor` | Cron-scheduled change detection with webhooks is exactly the shape of a source-monitoring product. |
| `Crawl` | Async, resumable, bounded crawling for a site subtree. |
| Research-style exploration | The graph abstractions (`SearchGraph`, `DepthSearch`, `Omni`) have no equivalent elsewhere. |

**Do not use it when:** the page is server-rendered and stable (tier 3 handles it),
volume makes 5 credits/page hurt, or you need per-row output (the multi-graph
merge fights you).

**Guardrail:** only call the LLM tier when the deterministic extractor reports a
coverage miss. Instrument that miss rate — if it exceeds ~30%, fix the deterministic
parsers before spending credits.

---

## 7. Recommended architecture

```
atlas worker (Node/TypeScript)
  │
  ├─ tier 0-3  deterministic  (feeds · JSON-LD · iCal · HTML scan)   ← 95% of pages, $0
  │
  └─ tier 4-6  long tail       (LLM extraction · managed browser)    ← 5% of pages
        │
        └──► Python sidecar (optional)
              POST /extract  { url, schema }  →  { ... }
              ScrapeGraphAI SmartScraperGraph(schema=...)
              LLM: gpt-5-nano / gpt-oss-20b
```

The sidecar is a **separate process with an HTTP contract**. That keeps Playwright,
the heavy dependency tree and the Python runtime out of the main worker, and it
means ScrapeGraphAI can be swapped for Crawl4AI, Firecrawl or a direct model call
without touching the pipeline.

### Sidecar contract

```http
POST /extract
Content-Type: application/json

{
  "url": "https://example.com/calendar",
  "schema": { "title": "string", "startDate": "string", "venueName": "string" },
  "timeZone": "America/New_York",
  "extractInstructions": "Extract the dance event details from this page."
}
```

```http
200 OK
{
  "ok": true,
  "method": "llm",
  "costUsd": 0.00087,
  "data": { "title": "Salsa Social", "startDate": "2027-03-05", "venueName": "The Loft" }
}
```

The worker treats the sidecar exactly like another tier in the ladder: same
candidate shape, same QA rules, same dedupe, same review queue. There is no
"trusted" path that bypasses validation — an LLM-extracted record faces the same
gate as a JSON-LD one.

### If you want to self-host ScrapeGraphAI anyway

- Patch `FetchNode` so `use_soup=True` is reachable from `SmartScraperGraph`'s
  `node_config` — otherwise you pay browser cost on every page.
- Set `config["llm"]["model_tokens"]` explicitly.
- Set `config={"force": True}` on non-OpenAI models.
- Use `SmartScraperMultiBatchGraph` if you are on OpenAI (Batch API ≈ 50% cheaper).
- **Do not** use `SmartScraperMultiGraph` for ingestion — loop `SmartScraperGraph`
  yourself or use the `scrapegraphai/smart-scraper` model route.
- Fix the `Dockerfile` to `python:3.12-slim`.

---

## 8. Comparison with alternatives

| Tool | Price per 1,000 pages | Why not / why |
|---|---|---|
| **Deterministic parsing (Atlas)** | $0.60–1.20 | **Chosen.** Cheapest, predictable, testable, no browser needed. |
| ScrapeGraphAI hosted | $3.33–15.00 | The long tail only. |
| ScrapeGraphAI self-hosted | $0.45–2.24 + infra | Viable but you own the browser fleet. |
| Firecrawl | ~$3.33–19 | Same economics; JSON extraction is also +4 credits. |
| Apify | ~$5–25+ | Complex pricing, most expensive per page at low volume. |
| Crawl4AI (Apache-2.0) | $0–2.24 + infra | **Best OSS alternative** — real browser pool, `JsonCssExtractionStrategy` for zero-LLM extraction, real caching. Watch the attribution requirement. |
| Browserless | +$0.78–1.40/hour | Browser infrastructure only, not a scraper. |
| Scrapy + feedparser | ~$0 (labour) | Excellent at scale and feeds; you write every selector. |
| httpx + BeautifulSoup/lxml | ~$0.60–1.20 | **What Atlas does**, plus JSON-LD extraction and robots handling. |

---

## 9. Decision

| Decision | Rationale |
|---|---|
| Deterministic-first, always | Feeds and JSON-LD are free and authoritative. |
| LLM only on a coverage miss | Measured miss rate drives spend. |
| ScrapeGraphAI self-hosted, as an optional sidecar | Isolation keeps Playwright out of the main worker and keeps the library swappable. |
| Never use the hosted API as the default path | 5 credits/page is 5–8× the cost of doing the same work directly. |
| Keep our own robots gate, rate limiter and change detection | These are legal and operational requirements, not extraction features. |
