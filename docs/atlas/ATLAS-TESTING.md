# Nodo Atlas — Testing and Acceptance

> Test strategy, the unit suite, the manual audit protocol and the acceptance criteria for the Charlotte pilot. Last updated: 2026-11-04.

This document describes how Nodo Atlas is tested, what the current suite proves and
what it does not, and the protocol an operator runs to decide whether the Charlotte
pilot is good enough to ship.

---

## 1. How the suite runs

```
npx tsx atlas/scripts/test.ts
```

| Property | Value |
|---|---|
| Framework | **None.** `atlas/scripts/test.ts` is a hand-rolled assertion runner |
| Assertions | **60**, all passing at the time of writing |
| Output | One `✓` or `✗` line per assertion, grouped under section headings |
| Exit code | `0` when all pass, `1` when any fail (`process.exitCode = failed > 0 ? 1 : 0`) |
| Runtime | Under a second |
| Network | **None.** Every test is a pure function over a string or an in-memory object |
| Database | **None.** The suite never touches SQLite or Neon |

The runner is three helpers at the top of the file:

```typescript
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`) }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), actual)
}
```

Actual output:

```
────────────────────────────────────────────────────────────
  60 passed, 0 failed
────────────────────────────────────────────────────────────
```

### Why there is no test framework

Adding Vitest or Jest would mean a new dependency, a config file and a CI pipeline.
The suite's job is to guard a deterministic core — recurrence maths, date parsing,
normalisation, dedupe keys, QA verdicts. Those are all pure functions that can be
asserted directly. The cost of the current approach is that there is no watch mode,
no per-test isolation and no coverage report; the benefit is that `npx tsx
atlas/scripts/test.ts` works on a fresh clone with nothing installed.

### The gap

**There are no tests for `atlas/lib/pipeline.ts`, `atlas/lib/fetcher.ts`,
`atlas/lib/robots.ts`, `atlas/lib/discovery.ts` or `atlas/lib/sitemap.ts`.** Those
are the modules that touch the network and the database. See §10.

---

## 2. Test groups and what each proves

### Group 1 — Recurrence (18 assertions)

| Test name | What it proves |
|---|---|
| `detects weekly on Wednesday` | "Every Wednesday at 8pm" produces a rule with `byDay` containing `3` |
| `weekly rule has BYDAY=WE` | The RRULE fragment is well-formed: `FREQ=WEEKLY;BYDAY=WE` |
| `weekly rule is bounded` | A rule always carries an `until`. **A series is never open-ended** |
| `every other Sunday → interval 2` | Biweekly phrasing maps to `interval: 2` |
| `every other Sunday → BYDAY=SU` | The weekday survives the interval change |
| `first Friday of month → MONTHLY` | Ordinal + month phrasing produces `FREQ=MONTHLY` |
| `first Friday of month → BYDAY=1FR` | The ordinal is encoded in the RRULE, not dropped |
| `two weekdays detected` | "Tuesdays and Thursdays" yields two `byDay` entries, not one |
| `non-schedule text is not recurring` | "Salsa social, chill vibes, great music" is **not** a schedule. The detector does not hallucinate recurrence from marketing copy |
| `"every X night" is recurring` | The `night` keyword alone is a schedule signal |
| `explicit count is captured` | "Weekly for 8 weeks" produces `count: 8` |
| `exception date captured` | "Every Monday except March 5" records an exception date |
| `7pm before DST is 00:00Z next day (EST)` | **The DST correctness assertion — see §3** |
| `7pm after DST is 23:00Z same day (EDT)` | **The DST correctness assertion — see §3** |
| `all weekly occurrences stay at 19:00 local across DST` | **The DST correctness assertion — see §3** |
| `weekly occurrences up to the horizon` | `expandOccurrences` returns exactly 7 occurrences for a rule bounded at 2026-04-15 |
| `flexible date parsing` | `parseFlexibleDate('March 5, 2027')` → `'2027-03-05'` |
| `horizon is bounded to N months` | `horizonEnd('2026-11-04', 6)` → `'2027-05-04'` |

### Group 2 — Date and time parsing (10 assertions)

| Test name | What it proves |
|---|---|
| `month name date` | "Join us March 5, 2027 at 8pm" → date `2027-03-05` |
| `numeric date` | "Event on 2027-03-05" → `2027-03-05` (ISO form) |
| `us slash date` | "Event on 03/05/2027" → `2027-03-05` (US month/day/year, not day-first) |
| `day month date` | "Event on 5th March 2027" → `2027-03-05` |
| `12-hour time` | "Starts at 7:30 PM" → `19:30` |
| `no-meridiem 24h time` | "Meeting at 19:30 sharp" → `19:30` |
| `time range end` | "Open 7:00 PM - 10:00 PM" → `endTime` `22:00` |
| `bare hour range` | "Doors 6-9pm" → `time` `18:00`. The meridiem on the end of the range is applied to the start |
| `recurrence phrase found` | `findRecurrencePhrase` locates the schedule fragment in mixed prose |
| `no recurrence phrase in plain text` | "Come learn salsa with us tonight" contains no schedule fragment |

### Group 3 — Normalization (9 assertions)

| Test name | What it proves |
|---|---|
| `style detection` | "Salsa and Bachata classes" → `['Bachata', 'Salsa']` |
| `west coast swing beats generic swing` | "West Coast Swing social" resolves to `West Coast Swing`, not `Ballroom` |
| `event type social` | "Monthly salsa social" → `SOCIAL` |
| `event type milonga` | "Milonga every Monday" → `TANGO_MILONGA` |
| `event type workshop` | "Bachata workshop with guest instructors" → `WORKSHOP` |
| `price parsed` | `$25` → `25` |
| `free price` | "Free entry" → `price` undefined (null means free) |
| `price range lower bound` | "$15-$20 drop-in" → `15`, with the original text kept in `priceText` |
| `address normalization strips unit` | "123 Main St, Suite 200, Charlotte NC" → `123 main st charlotte nc` |

### Group 4 — Location heuristics (4 assertions)

| Test name | What it proves |
|---|---|
| `street address found` | "Join us at 2935 Griffith St, Charlotte, NC 28203 every Monday" → address `2935 Griffith St` |
| `city and state found` | "Located in Charlotte, NC 28203" → city `Charlotte` |
| `venue name found` | "Venue: The Loft at 5th Street" → a venue name containing `Loft` |
| `no false venue from weekday` | "Monday Class" does **not** produce a venue named "Monday". This guards against the most common false positive in the heuristic set |

### Group 5 — HTML parsing (9 assertions)

| Test name | What it proves |
|---|---|
| `comments do not leak into text` | HTML comments are stripped before the text is scanned for dates |
| `doctype does not leak into text` | The doctype is stripped |
| `og:title extracted` | `og:title` meta is read |
| `json-ld block parsed` | One `application/ld+json` block is found and parsed |
| `link extracted` | An anchor's href and text are both extracted |
| `event extracted from json-ld` | A JSON-LD `Event` produces exactly one candidate |
| `json-ld local date` | `2027-03-05T23:00:00-05:00` → local date `2027-03-05` |
| `json-ld local time` | The same source → local time `23:00` |
| `json-ld method` | `extractionMethod` is `JSONLD`, which is what routes it to the top of the confidence table |

### Group 6 — Entity resolution (5 assertions)

| Test name | What it proves |
|---|---|
| `canonical url strips tracking` | `https://www.Example.com/events/?utm_source=x#top` → `https://example.com/events`. Lowercased host, no `www`, no trailing slash, no tracking params, no fragment |
| `same url + same date → deterministic duplicate` | Same canonical URL + same date is a certain duplicate |
| `same url + different week → series, not duplicate` | The same page on a different date is a **series**, proposed with `deterministic: false`. This is the assertion that stops a weekly class from being suppressed as a duplicate of its own previous occurrence |
| `different venue is not a duplicate` | Same title and date at a different venue is **not** auto-deterministic. It needs a human |
| `dedupe key is stable` | "Salsa Social" and "Salsa Social!" on different URLs produce the same key. This is the idempotency guarantee — see §4 |

### Group 7 — Quality assurance (5 assertions)

| Test name | What it proves |
|---|---|
| `good record passes QA` | A record with title, styles, venue, address, date and time passes |
| `past event is rejected` | A 2020 date is `REJECT`, not `QUARANTINE` |
| `robots-blocked source is rejected` | `robotsAllowed: false` is a **hard** reject |
| `missing source url is rejected` | A record with no traceable source URL is rejected. Nothing is published without a trace |
| `unbounded recurring claim is quarantined` | `isRecurring: true` with no `until` and no `count` is `QUARANTINE`, not `PASS` |

---

## 3. The property that matters most

> **A weekly 7pm local class must stay at 7pm local across a DST transition.**

This is the single most important property of the whole system. Everything else —
styles, prices, venue names — degrades gracefully. A class that drifts to 8pm is
wrong, and it is wrong silently, in a way a user notices and blames the app for.

The bug it guards against is not hypothetical. It is live in
`src/app/api/events/submit/route.ts:134`, which generates recurrence rows with
fixed millisecond arithmetic:

```typescript
const occStart = new Date(startDateTime.getTime() + i * interval * 7 * 24 * 60 * 60 * 1000)
```

168 hours is not always 7 local days.

### The assertion

Three assertions in `atlas/scripts/test.ts` cover this. The middle one is the
property:

```typescript
{
  const before = wallTimeToUtc('2026-03-04', '19:00', 'America/New_York') // EST
  const after = wallTimeToUtc('2026-03-11', '19:00', 'America/New_York')  // EDT
  check('7pm before DST is 00:00Z next day (EST)', before?.toISOString() === '2026-03-05T00:00:00.000Z', before?.toISOString())
  check('7pm after DST is 23:00Z same day (EDT)', after?.toISOString() === '2026-03-11T23:00:00.000Z', after?.toISOString())
}

{
  // A weekly 7pm class must stay at 7pm local across the DST boundary.
  const occurrences = expandOccurrences(
    { rrule: 'FREQ=WEEKLY;BYDAY=WE;UNTIL=20260415', interval: 1, byDay: [3], exceptions: [], until: '2026-04-15', timeZone: 'America/New_York', confidence: 0.9 },
    '2026-03-04'
  )
  const times = occurrences.map(o => utcToWallTime(wallTimeToUtc(o.date, '19:00', 'America/New_York')!, 'America/New_York').time)
  check('all weekly occurrences stay at 19:00 local across DST', times.every(t => t === '19:00'), times)
  eq('weekly occurrences up to the horizon', occurrences.length, 7)
}
```

### What it actually tests

The third assertion is a round trip. For every occurrence date produced by
`expandOccurrences`, it converts the wall-clock date and `19:00` into a UTC instant
with `wallTimeToUtc`, converts that instant back into local wall time with
`utcToWallTime`, and asserts the result is exactly `19:00`.

It uses the **March 2026 transition** as the boundary: 2026-03-08 is the US spring
forward. The series starts 2026-03-04 (EST, UTC-5) and runs weekly to 2026-04-15
(EDT, UTC-4). The 7 occurrences therefore straddle the transition:

| # | Occurrence date | Offset | Correct UTC | Under the fixed-ms bug |
|---|---|---|---|---|
| 1 | 2026-03-04 | EST (UTC-5) | `2026-03-05T00:00:00Z` | `2026-03-05T00:00:00Z` ✓ |
| 2 | 2026-03-11 | EDT (UTC-4) | `2026-03-11T23:00:00Z` | `2026-03-12T00:00:00Z` ✗ (8pm) |
| 3 | 2026-03-18 | EDT | `2026-03-18T23:00:00Z` | `2026-03-19T00:00:00Z` ✗ (8pm) |
| 4 | 2026-03-25 | EDT | `2026-03-25T23:00:00Z` | `2026-03-26T00:00:00Z` ✗ (8pm) |
| 5–7 | 2026-04-01 … 2026-04-15 | EDT | `23:00Z` | `00:00Z` ✗ (8pm) |

The buggy implementation would produce `['19:00','20:00','20:00','20:00','20:00','20:00','20:00']`
and the assertion would fail on the second element.

### Why the implementation is correct

`atlas/lib/recurrence.ts` never adds milliseconds to a UTC instant to step a
schedule forward. It walks the series in **calendar space** on `YYYY-MM-DD` strings
via `addDays()`, and converts each occurrence to UTC independently with a two-pass
offset resolution:

```typescript
export function wallTimeToUtc(localDate: string, localTime: string, timeZone: string): Date | null {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0)

  const offsetAt = (utcMs: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, ... }).formatToParts(new Date(utcMs))
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), ...)
    return asUtc - utcMs
  }

  let guess = naiveUtc - offsetAt(naiveUtc)
  guess = naiveUtc - offsetAt(guess)
  return new Date(guess)
}
```

This is the same algorithm as the `utc(wall)` helper in
`.hallmark/extend-june-classes.cjs`, ported to TypeScript. The hallmark script
asserts its own conversion before writing to the database:

```javascript
if (local('2026-06-01T23:00:00') !== '2026-06-01T19:00:00' ||
    utc('2026-11-09T19:00:00') !== '2026-11-10T00:00:00.000Z' ||
    utc('2026-06-01T19:00:00') !== '2026-06-01T23:00:00.000Z') throw Error('Timezone verification failed')
```

### The coverage gap

The suite proves Atlas computes occurrences correctly. It does **not** prove the
organizer-submission path does — that path is still broken and is not under test.
See §10.

A second gap: the suite exercises `America/New_York` only. Half-hour and 45-minute
offset zones (`Asia/Kolkata`, `Asia/Kathmandu`) and southern-hemisphere
transitions (`Australia/Sydney`, where the DST shift is 30 minutes in the opposite
direction) are untested. The two-pass algorithm handles them, but nothing proves it.

---

## 4. Idempotency test

> **Re-running a crawl must upsert the same candidate, not create a second row.**

### The key

`atlas/lib/dedupe.ts`:

```typescript
export function dedupeKey(candidate: ExtractedEvent): string {
  const title = normalizeTitle(candidate.title)
  const date = candidate.localDate ?? ''
  const time = candidate.localTime ?? ''
  const venue = normalizeAddress(candidate.address) || normalizeTitle(candidate.venueName ?? '')
  return `${title}|${date}|${time}|${venue}`
}
```

Normalized title + date + time + venue. Not the URL, not the source id — so the
same event listed on two pages of the same site collapses to one key, and the same
event listed with a trailing exclamation mark also collapses.

### The assertion

```typescript
{
  const key = dedupeKey({
    title: 'Salsa Social', styles: [], localDate: '2026-12-02', localTime: '19:00',
    isRecurring: false, recurrenceConfidence: 0, sourceUrl: 'https://a.com', foundFields: [], extractionMethod: 'HTML',
  })
  eq('dedupe key is stable', key, dedupeKey({
    title: 'Salsa Social!', styles: [], localDate: '2026-12-02', localTime: '19:00',
    isRecurring: false, recurrenceConfidence: 0, sourceUrl: 'https://b.com', foundFields: [], extractionMethod: 'HTML',
  }))
}
```

Two different titles (`Salsa Social` vs `Salsa Social!`), two different URLs, one
key. `normalizeTitle` strips punctuation and filler words
(`am|pm|tickets?|free|admission|event|social|practice|practica|class`).

### The upsert that consumes the key

`atlas/lib/pipeline.ts`:

```typescript
const key = dedupeKey(event)

// Idempotent upsert on (sourceId, dedupeKey)
const existing = await this.prisma.candidateEvent.findFirst({
  where: { sourceId, dedupeKey: key },
})

const candidate = existing
  ? await this.prisma.candidateEvent.update({ where: { id: existing.id }, data })
  : await this.prisma.candidateEvent.create({ data })
```

The upsert is keyed on `(sourceId, dedupeKey)`, not on `dedupeKey` alone. Two
different sources carrying the same event produce two candidate rows — which is
correct, because they are two independent claims, and the entity-resolution stage
proposes the merge to a human. Two crawls of the **same** source produce one row.

### The operator check

```bash
# before
npx tsx atlas/cli.ts review
# after re-crawling the same sources
npx tsx atlas/cli.ts crawl --force --limit 70
npx tsx atlas/cli.ts review
```

The candidate count must not rise. If it does, the extractor changed the shape of
the data it produces (a new title format, a different time string) and the dedupe
key changed with it.

### What is not covered by the suite

The assertion proves the key is stable. It does **not** prove the upsert works,
because that needs a database. The `persistCandidate` path is untested. §10.

---

## 5. The robots gate test

> **A disallowed path must never be fetched.**

### The mechanism

`atlas/lib/robots.ts` → `RobotsCache.decide()`. The gate is applied in
`atlas/lib/pipeline.ts` **before** the fetch:

```typescript
const decision = this.robots.decide(groups, targetUrl, this.fetcher.policy.userAgent)

if (!decision.allowed) {
  await this.recordAttempt(sourceId, {
    status: 'SKIPPED_BLOCKED',
    url: targetUrl,
    errorCode: 'ROBOTS_DISALLOWED',
    errorMessage: decision.reason,
    durationMs: Date.now() - started,
  })
  return { sourceId, url: targetUrl, status: 'SKIPPED_BLOCKED', ..., candidatesFound: 0, ... }
}
```

The `return` is before `this.fetcher.fetch(targetUrl, ...)`. There is no code path
that reaches the fetch without passing `decide()`.

### The assertion that exists today

```typescript
{
  const blocked = validateEvent(base, { now: new Date('2026-11-04T00:00:00Z'), robotsAllowed: false })
  check('robots-blocked source is rejected', blocked.status === 'REJECT', blocked.reasons)
}
```

This proves the **QA layer** rejects a candidate from a blocked source. It does not
prove the **gate** prevented the fetch. Those are different assertions, and only the
second one matters for compliance.

### The missing test

There is no unit test for `RobotsCache.decide()`. It should be added. The cases
that need covering:

| Case | robots.txt | URL | Expected | Why it matters |
|---|---|---|---|---|
| Explicit disallow | `User-agent: *\nDisallow: /private/` | `https://x.test/private/a` | `allowed: false` | The basic gate |
| Longest rule wins | `Disallow: /a/\nAllow: /a/b/` | `https://x.test/a/b/c` | `allowed: true` | `/a/b/` is longer, so it wins |
| Allow wins ties | `Disallow: /x/\nAllow: /x/` | `https://x.test/x` | `allowed: true` | Equal length, Allow wins |
| No matching group | `User-agent: SomeBot\nDisallow: /` | `https://x.test/anything` | `allowed: true` | No group applies to us |
| Specific agent group wins | `User-agent: *\nDisallow: /\nUser-agent: NodoAtlasBot\nDisallow:` | `https://x.test/anything` | `allowed: true` | Our named group applies |
| Wildcard | `Disallow: /*.pdf` | `https://x.test/a/b.pdf` | `allowed: false` | The `*` wildcard |
| `$` anchor | `Disallow: /page$` | `https://x.test/page` | `allowed: false` | The `$` anchor |
| Empty disallow | `Disallow:` | `https://x.test/anything` | `allowed: true` | Empty means allow-all |
| Crawl-delay parsed | `Crawl-delay: 30` | any | `crawlDelayMs: 30000` | Honoured in the decision object |

The **end-to-end** version of the test needs a fake fetcher:

```typescript
// the shape it should take
const fetched: string[] = []
const fakeFetcher = async (url: string) => { fetched.push(url); return { status: 200, body: '' } }

const groups = parseRobots('User-agent: *\nDisallow: /private/')
const decision = robots.decide(groups, 'https://x.test/private/secret', USER_AGENT)

assert.equal(decision.allowed, false)
assert.deepEqual(fetched, [])   // the URL was never requested
```

### The operator check

```bash
# a source whose robots.txt disallows the path
npx tsx atlas/cli.ts crawl --source <id>
```

The output line must read `SKIPPED_BLOCKED`, and the `CrawlAttempt` row must carry
`status = 'SKIPPED_BLOCKED'` with `errorCode = 'ROBOTS_DISALLOWED'`. The
`DiscoverySource.robotsStatus` must be `DISALLOWED` and `robotsDetail` must quote
the matching rule.

---

## 6. Extraction ladder test matrix

The ladder in `atlas/lib/parsers/extract.ts` tries JSON-LD first, then RSS, then
iCal, then heuristic HTML. A tier only runs when the tier above it produced
nothing, so each row below must be tested **in isolation** — the fixture for row 3
must contain nothing that row 1 or row 2 would match.

### Expected confidence bands

Confidence comes from `scoreConfidence()` in `atlas/lib/qa.ts`. The field weights:

| Field | Weight | | Field | Weight |
|---|---|---|---|---|
| `title` | 0.18 | | `city` | 0.06 |
| `startDateTime` | 0.28 | | `description` | 0.04 |
| `localDate` | 0.14 | | `organizerName` | 0.03 |
| `localTime` | 0.08 | | `eventType` | 0.02 |
| `venueName` | 0.12 | | `styles` | 0.02 |
| `address` | 0.10 | | `registrationUrl` | 0.02 |
| | | | `price` | 0.01 |

Method bonus: `JSONLD` +0.15, `RSS`/`ICAL` +0.08, `LLM` +0.05, `HTML` +0.
Bounded recurrence (`isRecurring` and a rule with `until`) +0.05.
Ambiguous recurrence (`recurrenceConfidence < 0.6`) −0.05.
Result is clamped to `[0, 1]`.

The QA publication threshold is `confidence < 0.45 → QUARANTINE`.

### The matrix

| Tier | Input shape | Expected fields | Expected `extractionMethod` | Expected confidence | Expected verdict |
|---|---|---|---|---|---|
| **JSON-LD** | `<script type="application/ld+json">` with `@type: "Event"`, `name`, `startDate` with offset, `location.name`, `location.address`, `organizer.name`, `description`, `offers.price` | `title`, `startDateTime`, `description`, `venueName`, `address`, `organizerName`, `price` | `JSONLD` | **0.91** | `PASS` |
| JSON-LD + bounded recurrence | As above, description contains "every Wednesday at 7pm" | As above + `isRecurring`, `recurrenceRule`, `recurrenceText` | `JSONLD` | **0.96** | `PASS` |
| JSON-LD minimal | `name` + `startDate` only | `title`, `startDateTime` | `JSONLD` | **0.61** | `QUARANTINE` — reason *"No location information"* |
| **RSS** | `<rss><item><title>…</title><link>…</link><description>…</description><pubDate>…</pubDate></item></rss>` | `title`, `startDateTime`, `description` | `RSS` | **0.58** | `QUARANTINE` — reason *"No location information"* |
| RSS + bounded recurrence | Description contains "every Tuesday" | As above + recurrence fields | `RSS` | **0.63** | `QUARANTINE` — reason *"No location information"* |
| **iCal** | `BEGIN:VEVENT` with `SUMMARY`, `DTSTART:20260305T190000`, `LOCATION`, `RRULE:FREQ=WEEKLY;BYDAY=WE` | `title`, `startDateTime`, `venueName` | `ICAL` | **0.66** | `PASS` — `LOCATION` satisfies the location check |
| iCal + bounded recurrence | As above, `RRULE` includes `UNTIL=` | As above + recurrence fields | `ICAL` | **0.71** | `PASS` |
| **HTML heuristic** | Plain HTML, no structured data, a date-anchored block with a link, a heading and a date | `title`, `startDateTime` | `HTML` | **0.46** | `QUARANTINE` — reason *"No location information"* |
| HTML heuristic, full | The same block with a venue name and a street address | `title`, `startDateTime`, `venueName`, `address` | `HTML` | **0.68** | `PASS` |
| HTML weekday schedule | A page with "Tango Wednesdays at 8pm" and no calendar date | `title`, `startDateTime` (next matching weekday), `isRecurring`, `recurrenceRule` | `HTML` | **0.46–0.73** | `QUARANTINE` unless the page names a venue or an address |
| **Generic-title resolution** | A calendar index whose link text is "View Event →", linking to a detail page with JSON-LD | The detail page's fields. `sourceUrl` stays the index URL; `sourceUrlCanonical` becomes the detail URL | Inherited from the detail page — `JSONLD` | **0.91** | `PASS` |
| Generic-title resolution, blocked detail page | The detail page is disallowed by robots.txt | The original generic candidate is kept unchanged | `HTML` | **0.46–0.68** | `QUARANTINE` unless the index block named a venue |

### The generic-title case specifically

`isGenericTitle()` in `atlas/lib/parsers/html.ts` recognises `view event`,
`more info`, `learn more`, `register`, `rsvp`, `click here`, `buy tickets`,
`save the date` and the arrow variants. `atlas/lib/pipeline.ts` then follows the
link and re-extracts, but **only if the robots gate allows the target URL**:

```typescript
const decision = await this.isAllowed(target)
if (!decision) { out.push(event); continue }
```

This is the one place Atlas follows a URL it did not construct, so it is the one
place the robots check matters most. It is also currently untested.

### Fixtures

There is no fixture directory. Every HTML fixture in the suite is an inline string
in `atlas/scripts/test.ts`. Adding the ladder matrix means either:

- inline strings (consistent with the current style, but the file grows past 600
  lines), or
- `atlas/scripts/fixtures/<tier>.html` files, loaded with `readFileSync`.

The second is better. A fixture directory makes the "no JSON-LD in the RSS
fixture" rule enforceable — you can grep the fixture directory and see which tier
each file belongs to.

---

## 7. Manual audit protocol

Unit tests prove the pipeline is internally consistent. They do not prove the
extracted data is *true*. Only a human comparing a record against the page it came
from can do that.

### Protocol

1. **Sample.** Take a random sample of the published records. `N = 30` is the
   minimum for the Charlotte pilot; `N = 50` if the pipeline has changed. Do not
   sample from the top of the queue — the queue is ordered by confidence, so a
   top-of-queue sample is biased toward the good records.
2. **Freeze the sample.** Record the candidate IDs before starting. Do not re-sort
   or re-pull mid-audit.
3. **For each record, open the source page.** The `sourceUrl` on the published
   `Event` is the page. Use a logged-out browser.
4. **Check five fields against the source**, recording `MATCH` or `MISMATCH` and a
   one-line note for each mismatch:

   | Field | The question |
   |---|---|
   | `title` | Is this the name the organiser gave the event? |
   | `localDate` | Is this the date on the page, in the venue's local time? |
   | `localTime` | Is this the start time on the page? |
   | `venueName` + `address` | Is this where the event actually happens? |
   | `styles` | Are the dance styles right? Is a style missing or invented? |

5. **Also check, once per record:** does the page still show this event at all? A
   record whose event has been cancelled or removed is a false positive even if
   every field matches.
6. **For recurring records, additionally check the wall time.** Convert the
   published `startDateTime` to `America/New_York` and confirm it reads as the
   published `localTime`. This is the check that would have caught the drift.
7. **Record the errors.** One row per error, with the candidate ID, the field, what
   the source said, and what we published.
8. **Compute precision** as `correct records / total records`. A record with one
   mismatched field out of five is a **field-level** error, not a record-level
   error. Report both numbers.

### The record sheet

| Candidate ID | Field | Source says | We published | Verdict | Notes |
|---|---|---|---|---|---|
| | title | | | MATCH / MISMATCH | |
| | localDate | | | MATCH / MISMATCH | |
| | localTime | | | MATCH / MISMATCH | |
| | venueName / address | | | MATCH / MISMATCH | |
| | styles | | | MATCH / MISMATCH | |
| | still listed on the page? | | | yes / no | |

### Summary sheet

| Metric | Value |
|---|---|
| Sample size | |
| Records fully correct | |
| Record-level precision | |
| Field-level precision | |
| Title errors | |
| Date errors | |
| Time errors | |
| Venue errors | |
| Style errors | |
| Event no longer exists on the source | |
| Most common error | |

### Sampling rule for recurring series

Sample at the **occurrence** level, not the series level. A series with 12
occurrences that is wrong in all 12 is one error, not twelve; but a series that is
right in March and wrong in November is two errors and one bug. Sample the
earliest and the latest occurrence of every recurring record in the sample.

---

## 8. Charlotte pilot acceptance criteria

The operator fills in the last column. Every threshold is either a property the
code already guarantees or a number that has to be measured.

### Correctness

| # | Criterion | Threshold | Measured | Pass / Fail |
|---|---|---|---|---|
| 1 | Weekly 7pm local class stays at 7pm local across the March 2026 transition | 100% of occurrences | | ☐ |
| 2 | Weekly 7pm local class stays at 7pm local across the November 2026 transition | 100% of occurrences | | ☐ |
| 3 | Every published recurring record has a bounded horizon (`until` or `count`) | 100% | | ☐ |
| 4 | Every published record has a non-empty `sourceUrl` | 100% | | ☐ |
| 5 | Every published record has a `verifiedAt` timestamp | 100% | | ☐ |
| 6 | Every published record carries `publishedVia = 'ATLAS'` | 100% | | ☐ |
| 7 | Published `organizerEmail` is the reserved `.invalid` address | 100% | | ☐ |
| 8 | Record-level precision, manual audit (§7) | ≥ 95% | | ☐ |
| 9 | Field-level precision, manual audit (§7) | ≥ 98% | | ☐ |
| 10 | Time-of-day errors in the manual audit | 0 | | ☐ |
| 11 | Date errors in the manual audit | 0 | | ☐ |

### Pipeline behaviour

| # | Criterion | Threshold | Measured | Pass / Fail |
|---|---|---|---|---|
| 12 | Unit suite passes | 60/60, exit code 0 | | ☐ |
| 13 | Re-running a crawl does not increase the candidate count | 0 new candidates | | ☐ |
| 14 | Robots-disallowed paths fetched | 0 | | ☐ |
| 15 | Paths fetched concurrently against the same domain | 0 | | ☐ |
| 16 | Minimum gap between two requests to the same domain | ≥ 2000 ms | | ☐ |
| 17 | Response bodies larger than 5 MB accepted | 0 | | ☐ |
| 18 | Requests exceeding the 20 s timeout | 0 hung | | ☐ |
| 19 | Candidates published without a human decision | 0 | | ☐ |
| 20 | Matches auto-merged rather than proposed | 0 | | ☐ |

### Coverage and honesty

| # | Criterion | Threshold | Measured | Pass / Fail |
|---|---|---|---|---|
| 21 | Sources registered for Charlotte | ≥ 60 | | ☐ |
| 22 | Sources with a successful crawl in the last 7 days | ≥ 90% | | ☐ |
| 23 | Sources with `permissionsStatus` deliberately set (no `UNKNOWN`) | 100% | | ☐ |
| 24 | Sources with `optOut = true` that were crawled afterwards | 0 | | ☐ |
| 25 | Public copy claiming complete coverage of Charlotte | 0 claims | | ☐ |
| 26 | Public copy claiming a partnership or endorsement | 0 claims | | ☐ |

### Cost and operability

| # | Criterion | Threshold | Measured | Pass / Fail |
|---|---|---|---|---|
| 27 | Total crawl cost for the pilot | $0 — deterministic tiers only | | ☐ |
| 28 | LLM sidecar invoked | 0 times during the pilot | | ☐ |
| 29 | Sources requiring the LLM (JS-rendered) | recorded and listed | | ☐ |
| 30 | Kill switch verified to stop all crawling | 100% of sources paused | | ☐ |
| 31 | Opt-out request honoured within 24 hours | 100% | | ☐ |
| 32 | Time from opt-out to published listings removed | ≤ 72 hours | | ☐ |

### Pilot state at the time of writing

From `npx tsx atlas/cli.ts report` against `atlas/prisma/atlas.db`:

| Metric | Value |
|---|---|
| Cities registered | 7 |
| Sources registered | 66 |
| Candidate schools | 64 |
| Candidates extracted | 150 |
| Passed QA | 33 |
| Quarantined | 32 |
| Rejected | 85 |
| Duplicate proposals | 197 |
| Awaiting review | 150 |
| Published | 0 |
| Crawl attempts | 65 `SUCCESS`, 1 `FAILED` |

### Why the QA gate rejected what it rejected

The reason distribution across all 150 candidates, read directly from
`CandidateEvent.qaReasons`:

| QA reason | Candidates | Effect |
|---|---|---|
| `Event date is in the past` | 85 | `REJECT` |
| `No location information` | 65 | `QUARANTINE` (not a hard reject) |

52 candidates were rejected for the past-date reason **and nothing else**; the
other 33 rejections carry both reasons. This is a direct, measured confirmation of
the ladder matrix in §6: the RSS tier and the bare HTML heuristic do not produce a
venue or an address, so every candidate from those tiers lands in `QUARANTINE`
with the reason *"No location information"*. The JSON-LD and iCal tiers, which do
carry location, are the ones that reach `PASS`.

That single fact is the strongest argument for the extraction ladder being
ordered the way it is.

**These numbers are lower bounds for a system that has not been reviewed.** 150
candidates, zero published. Nothing has been shown to a user yet. Every row in the
acceptance table above still has to be measured.

Note: `atlas/README.md` quotes an earlier run of the pilot — 95 candidates, 29
pass, 6 quarantine, 60 rejected, 259 duplicate proposals, 63 schools. The live
database has moved on. The README table is stale.

---

## 9. Regression checklist

**Run this every time an extractor, parser, normaliser or QA rule changes.** The
ordering matters: the cheap deterministic checks come first, and the expensive
network crawl comes last.

```
□  1. npx tsx atlas/scripts/test.ts
        → 60 passed, 0 failed, exit code 0
        If it fails, stop. Do not crawl.

□  2. npx tsx atlas/scripts/gen-local-schema.ts
        → "[gen-local-schema] wrote .../atlas/prisma/schema.local.prisma"
        Only needed if prisma/schema.prisma changed. The script exits 1 and
        prints "Schema shape changed — update this script" if the datasource
        block no longer matches its regexes.

□  3. npx prisma db push --schema atlas/prisma/schema.local.prisma --skip-generate --accept-data-loss
        Only if step 2 ran.

□  4. npx prisma generate --schema atlas/prisma/schema.local.prisma
        Only if the schema changed.

□  5. Record the BEFORE counts
        npx tsx atlas/cli.ts report
        → candidates, pass, quarantine, rejected, matches, schools
        Write them down. The diff in step 8 is meaningless without them.

□  6. npx tsx atlas/cli.ts crawl --reextract --force --limit 70
        --reextract clears etag, lastModified and contentHash on every source
        so that every page is re-fetched and re-parsed. Without it the
        conditional-request cache short-circuits the crawl and you will
        measure nothing.

□  7. npx tsx atlas/cli.ts crawl --force --limit 70
        Run again immediately. This is the idempotency check.
        The candidate count must NOT increase.

□  8. Record the AFTER counts and diff them against step 5
        npx tsx atlas/cli.ts report
        Expected: candidates unchanged (step 7 proved it), but pass/quarantine/
        rejected may shift if a QA threshold changed. A large shift in
        "rejected" is the signal that a rule changed behaviour.

□  9. npx tsx atlas/cli.ts review --all
        Read the new candidates by hand. Specifically look for:
          · candidates whose title changed shape
          · candidates whose localTime changed
          · candidates that lost their venueName
        These are the regressions a count diff will not show.

□ 10. If the change touched recurrence or time handling:
        Re-verify the DST assertion by hand
          npx tsx -e "…wallTimeToUtc('2026-11-04','19:00','America/New_York')…"
        A 7pm class in November must be 2026-11-05T00:00:00Z (EST), and in
        July 2026-07-15T23:00:00Z (EDT).

□ 11. If the change touched the pipeline or the schema:
        npx tsx atlas/cli.ts kill-switch --on
        npx tsx atlas/cli.ts kill-switch --off
        Confirm the crawl in step 7 still ran and nothing was left paused.

□ 12. npx tsx atlas/cli.ts report
        Final counts. Attach them to the change.
```

### The two rules that matter

1. **Never skip step 6.** `--reextract` is what makes the crawl a re-parse rather
   than a no-op. Without it, `contentHash` matches and the crawl reports
   `SKIPPED_UNCHANGED`, the candidate counts do not move, and you conclude the
   extractor change was fine when it was never exercised.
2. **Always run the crawl twice.** Step 7 is the only place the idempotency
   guarantee is exercised end to end. A change to `normalizeTitle` or
   `normalizeAddress` alters `dedupeKey`, and the visible symptom is a doubling of
   candidates. The second run catches it immediately.

---

## 10. What is not tested, and should be

Ordered by risk.

### 10.1 Integration tests against a fixture corpus — **highest value**

**Not tested:** the pipeline. `atlas/lib/pipeline.ts` is 637 lines that orchestrate
robots gating, conditional fetching, change detection, extraction, QA, dedupe,
persistence and source health. None of it is covered.

**What is needed:** a `atlas/scripts/fixtures/` directory with a handful of saved
HTML pages, a fake `Fetcher` that serves them, and an in-memory or file-backed
SQLite database seeded with one `DiscoverySource`. Then:

| Test | Asserts |
|---|---|
| A disallowed URL is never fetched | The fake fetcher's call log contains only `robots.txt` |
| A 304 response produces no candidate | `candidatesFound === 0` |
| An unchanged content hash produces no candidate | `status === 'SKIPPED_UNCHANGED'` |
| A changed content hash produces a candidate | `status === 'SUCCESS'` |
| Crawling twice yields one candidate row | `count === 1` |
| A `DENIED` source yields no candidate | `candidatesFound === 0` |
| A `QUARANTINE` candidate is still persisted | The row exists with `qaStatus = 'QUARANTINE'` |
| `RawExtraction` is written on every successful crawl | One row per fetch |
| `SourceEvidence` is written for JSON-LD candidates | One row per extracted field |
| A failure increments `consecutiveFailures` and sets `nextCrawlAt` | The source backs off |
| `robotsStatus` and `robotsDetail` are written on a status change | The source reflects the verdict |

This suite needs no network and no Neon. It runs in the same second as the current
one.

### 10.2 A robots precedence unit suite — **high value, low cost**

`RobotsCache.decide()` implements the precedence rules described in
`ATLAS-SECURITY.md` §4 and has **no test at all**. The nine cases in §5 of that
document are the table. `parseRobots()` is not exported, so it needs to be — or
`decide()` needs to accept groups directly, which it already does.

The compliance argument depends on these rules being right. Right now that is an
assertion in a code comment, not a test.

### 10.3 LLM sidecar contract tests — **blocked on the sidecar**

The ScrapeGraphAI sidecar is designed but not built. When it is, the contract
needs tests before it is allowed to touch a single production page:

| Contract point | Must be specified |
|---|---|
| Request | URL, the Atlas User-Agent, the target schema |
| Response | Must be valid JSON matching `ExtractedEvent`; every field optional except `title` and `sourceUrl` |
| Timeout | Must be shorter than the fetch timeout, or the sidecar must be able to abort |
| Failure | Must fail closed — a sidecar error must never delete a candidate, only fail to create one |
| Provenance | Every field the sidecar returns must carry `method: 'LLM'` so `SourceEvidence` records it |
| Isolation | The sidecar must never receive credentials and must never be pointed at a non-public URL |
| Budget | A per-run cost ceiling enforced by the caller, not by the sidecar |

Until the sidecar exists, the correct test is that **the LLM path is unreachable**.
`extractEvents()` has no LLM branch — the ladder stops at the HTML heuristic. Tiers
4–6 in `ATLAS-ARCHITECTURE.md` are not implemented.

### 10.4 Load testing the crawl scheduler — **needed before the rollout**

**Not tested:** `/api/atlas/tick` and the CLI's crawl loop under volume.

| Question | How to answer it |
|---|---|
| How long does a 70-source crawl take? | Time `atlas crawl --force --limit 70` with 2.5 s politeness. The floor is 70 × 2.5 s = 175 s per domain, plus transfer time |
| Does the 300 s `maxDuration` on `/api/atlas/tick` hold? | Inline mode does not crawl — it only writes `CrawlJob` rows. Enqueue mode is O(1) in the number of sources |
| What is the queue drain rate? | Measure `CrawlJob` rows created per hour against rows completed |
| What happens when a source hangs? | The 20 s timeout applies. A crawl of 70 hanging sources takes 70 × 20 s = 23 minutes of pure timeout |
| Does the domain lock serialise correctly? | Assert that no two requests to the same hostname overlap. This is the politeness guarantee |
| What is the memory profile? | The `Fetcher` holds a promise chain per domain and a `Map` of last-request timestamps. Both are bounded by the number of distinct domains |
| What is the database write volume? | Per source: 1 `CrawlJob`, 1 `CrawlAttempt`, 1 `RawExtraction`, N `CandidateEvent`, plus `SourceEvidence` and `EntityMatch` per candidate. `RawExtraction.rawPayload` is capped at 200 KB — at 70 sources per run that is up to 14 MB per run |

### 10.5 Fetcher unit tests — **medium value**

`Fetcher` has four guarantees stated in its header and none of them are tested:
one request per domain at a time, the politeness delay, the byte cap, and the
timeout. Each is testable with a local HTTP server. The byte cap in particular is
the one that protects the worker from a hostile response.

### 10.6 Recurrence across non-Eastern zones — **medium value**

`wallTimeToUtc` is only tested with `America/New_York`. The seven rollout cities
include `America/Chicago` (Austin, Chicago). The November transition in Chicago
is 2026-11-01, and Austin observes the same rules. Add cases for:

| Zone | Transition | What to assert |
|---|---|---|
| `America/Chicago` | 2026-03-08 / 2026-11-01 | 19:00 local maps to 00:00Z (EST) and 00:00Z (CDT) respectively — the UTC offsets differ from Eastern |
| `America/Los_Angeles` | 2026-03-08 / 2026-11-01 | 19:00 local → 03:00Z / 02:00Z |
| `Asia/Kolkata` | none | 19:00 local → 13:30Z, every day, year round. A half-hour offset |
| `Australia/Sydney` | 2026-04-05 / 2026-10-04 | Southern hemisphere — the transition runs the other way, and a 30-minute shift |
| `Pacific/Chatham` | 2026-04-05 | 45-minute offset |

### 10.7 A regression test for the submit route's DST bug — **the awkward one**

The bug in `src/app/api/events/submit/route.ts` is still live. There is no test
framework in `src/`, and the submit route is a Next.js route handler that talks to
Prisma and Nominatim, so it is not directly unit-testable in the current shape.

Three options, in order of effort:

1. **Extract the recurrence generation into a pure function** and test it in
   `atlas/scripts/test.ts` alongside the Atlas version. This is the same change
   that would fix the bug — the fix and the test are the same refactor.
2. **Add a route-level test** using a mocked Prisma and a mocked `fetch`, which
   requires a test runner.
3. **Leave it.** The bug stays, and a manually-submitted recurring event drifts by
   an hour twice a year.

Option 1 is the right one. It also removes the duplicated recurrence logic between
the web app and Atlas.

### 10.8 Not worth building

| Idea | Why not |
|---|---|
| Snapshot testing of HTML parsing | The extractor's output is deliberately lossy and will change constantly. Assert on the fields that matter, not on whole objects |
| Coverage tooling | The suite is 270 lines. A coverage report would show high percentages for the wrong reasons |
| E2E tests of the admin UI | The admin UI is a thin shell over three JSON endpoints. The endpoints are worth testing; the shell is not |
| Property-based testing of the parsers | Tempting, but the free-text space is enormous and a generator would mostly produce text no dance venue publishes. The current hand-written cases match reality better |

---

## 11. Command reference

| Command | Purpose |
|---|---|
| `npx tsx atlas/scripts/test.ts` | Run the unit suite. Exit 0 on success |
| `npx tsx atlas/cli.ts report` | Coverage and quality report — the counts used in the acceptance table |
| `npx tsx atlas/cli.ts review` | The candidate review queue (`--all` includes QA-rejected candidates) |
| `npx tsx atlas/cli.ts review --all` | Includes auto-rejected candidates, for regression inspection |
| `npx tsx atlas/cli.ts crawl --force --limit 70` | Crawl sources, ignoring the schedule |
| `npx tsx atlas/cli.ts crawl --reextract --force --limit 70` | Clear the conditional-request fingerprints first, so every page is re-parsed |
| `npx tsx atlas/cli.ts sources` | The source registry, with the robots status and next crawl date |
| `npx tsx atlas/cli.ts kill-switch --on` / `--off` | Pause or resume every source |
| `npx tsx atlas/scripts/gen-local-schema.ts` | Regenerate the SQLite schema from `prisma/schema.prisma` |
| `npx prisma db push --schema atlas/prisma/schema.local.prisma --skip-generate --accept-data-loss` | Push the local schema to SQLite |
| `npx prisma generate --schema atlas/prisma/schema.local.prisma` | Regenerate the local Prisma client |

---

## 12. Related documents

| Document | Purpose |
|---|---|
| `ATLAS-ARCHITECTURE.md` | System shape, extraction ladder, deployment topology |
| `ATLAS-REPO-AUDIT.md` | What the repository contains today, and what Atlas changed |
| `ATLAS-SECURITY.md` | Permissions, robots enforcement, data minimisation, opt-out |
