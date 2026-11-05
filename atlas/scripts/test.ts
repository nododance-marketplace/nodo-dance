/**
 * Atlas unit tests — the deterministic core.
 *
 * Run: npx tsx atlas/scripts/test.ts
 * No test framework dependency: the assertions below are the contract that
 * the ingestion pipeline relies on before anything reaches the database.
 */
import { detectRecurrence, expandOccurrences, horizonEnd, parseFlexibleDate, utcToWallTime, wallTimeToUtc } from '../lib/recurrence'
import { canonicalUrl, dedupeKey, proposeMatches } from '../lib/dedupe'
import { detectEventType, detectStyles, normalizeAddress, parsePrice } from '../lib/normalize'
import { findRecurrencePhrase, parseDateTime, parseTime } from '../lib/parsers/dates'
import { findAddress, findCityStateZip, findVenueName } from '../lib/location'
import { extractJsonLd, extractLinks, extractMeta, stripHtml } from '../lib/parsers/html'
import { extractEvents } from '../lib/parsers/extract'
import { validateEvent } from '../lib/qa'
import type { ExtractedEvent } from '../lib/types'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`)
  }
}

function eq<T>(name: string, actual: T, expected: T): void {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), actual)
}

function section(title: string): void {
  console.log(`\n${title}`)
}

// ── Recurrence ─────────────────────────────────────────────────────────────
section('Recurrence')

{
  const r = detectRecurrence('Every Wednesday at 8pm', '2026-11-04', 'America/New_York')
  check('detects weekly on Wednesday', Boolean(r.isRecurring && r.rule?.byDay.includes(3)), r.rule)
  check('weekly rule has BYDAY=WE', Boolean(r.rule?.rrule.includes('BYDAY=WE')), r.rule?.rrule)
  check('weekly rule is bounded', Boolean(r.rule?.until), r.rule?.until)
}

{
  const r = detectRecurrence('Every other Sunday', '2026-11-04', 'America/New_York')
  eq('every other Sunday → interval 2', r.rule?.interval, 2)
  check('every other Sunday → BYDAY=SU', Boolean(r.rule?.rrule.includes('BYDAY=SU')), r.rule?.rrule)
}

{
  const r = detectRecurrence('First Friday of each month', '2026-11-04', 'America/New_York')
  check('first Friday of month → MONTHLY', Boolean(r.rule?.rrule.startsWith('FREQ=MONTHLY')), r.rule?.rrule)
  check('first Friday of month → BYDAY=1FR', Boolean(r.rule?.rrule.includes('BYDAY=1FR')), r.rule?.rrule)
}

{
  const r = detectRecurrence('Tuesdays and Thursdays', '2026-11-04', 'America/New_York')
  eq('two weekdays detected', r.rule?.byDay.length, 2)
}

{
  const r = detectRecurrence('Salsa social, chill vibes, great music', '2026-11-04', 'America/New_York')
  check('non-schedule text is not recurring', !r.isRecurring, r.label)
}

{
  const r = detectRecurrence('Every Thursday night', '2026-11-04', 'America/New_York')
  check('"every X night" is recurring', r.isRecurring, r.label)
}

{
  const r = detectRecurrence('Weekly for 8 weeks', '2026-11-04', 'America/New_York')
  eq('explicit count is captured', r.rule?.count, 8)
}

{
  const r = detectRecurrence('Every Monday except March 5', '2026-11-04', 'America/New_York')
  check('exception date captured', (r.rule?.exceptions ?? []).includes('2027-03-05') || (r.rule?.exceptions ?? []).length > 0, r.rule?.exceptions)
}

// DST correctness — the single most important property of this module
{
  const before = wallTimeToUtc('2026-03-04', '19:00', 'America/New_York') // EST
  const after = wallTimeToUtc('2026-03-11', '19:00', 'America/New_York') // EDT
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

{
  eq('flexible date parsing', parseFlexibleDate('March 5, 2027'), '2027-03-05')
  eq('horizon is bounded to N months', horizonEnd('2026-11-04', 6), '2027-05-04')
}

// ── Dates ──────────────────────────────────────────────────────────────────
section('Date and time parsing')

eq('month name date', parseDateTime('Join us March 5, 2027 at 8pm').date, '2027-03-05')
eq('numeric date', parseDateTime('Event on 2027-03-05').date, '2027-03-05')
eq('us slash date', parseDateTime('Event on 03/05/2027').date, '2027-03-05')
eq('day month date', parseDateTime('Event on 5th March 2027').date, '2027-03-05')
eq('12-hour time', parseTime('Starts at 7:30 PM').time, '19:30')
eq('no-meridiem 24h time', parseTime('Meeting at 19:30 sharp').time, '19:30')
eq('time range end', parseTime('Open 7:00 PM - 10:00 PM').endTime, '22:00')
eq('bare hour range', parseTime('Doors 6-9pm').time, '18:00')
check('recurrence phrase found', findRecurrencePhrase('Tango every Wednesday at 8pm') !== undefined)
check('no recurrence phrase in plain text', findRecurrencePhrase('Come learn salsa with us tonight') === undefined)

// ── Normalization ──────────────────────────────────────────────────────────
section('Normalization')

eq('style detection', detectStyles('Salsa and Bachata classes').sort(), ['Bachata', 'Salsa'])
check('west coast swing beats generic swing', detectStyles('West Coast Swing social').includes('West Coast Swing'))
eq('event type social', detectEventType('Monthly salsa social'), 'SOCIAL')
eq('event type milonga', detectEventType('Milonga every Monday'), 'TANGO_MILONGA')
eq('event type workshop', detectEventType('Bachata workshop with guest instructors'), 'WORKSHOP')
eq('price parsed', parsePrice('$25').price, 25)
eq('free price', parsePrice('Free entry').price, undefined)
eq('price range lower bound', parsePrice('$15-$20 drop-in').price, 15)
eq('address normalization strips unit', normalizeAddress('123 Main St, Suite 200, Charlotte NC'), '123 main st charlotte nc')

// ── Location heuristics ────────────────────────────────────────────────────
section('Location heuristics')

eq('street address found', findAddress('Join us at 2935 Griffith St, Charlotte, NC 28203 every Monday'), '2935 Griffith St')
eq('city and state found', findCityStateZip('Located in Charlotte, NC 28203').city, 'Charlotte')
check('venue name found', (findVenueName('Venue: The Loft at 5th Street') ?? '').includes('Loft'))
check('no false venue from weekday', !/^(mon|tue)/i.test(findVenueName('Monday Class') ?? ''))

// ── HTML parsing ───────────────────────────────────────────────────────────
section('HTML parsing')

{
  const html = `<!doctype html><html><head><title>Test</title>
    <meta property="og:title" content="Salsa Social" />
    <script type="application/ld+json">{"@type":"Event","name":"Salsa Social","startDate":"2027-03-05T23:00:00-05:00"}</script>
    <!-- a comment that must not leak -->
    </head><body><a href="/events/salsa">Salsa Social</a></body></html>`

  const { text } = stripHtml(html)
  check('comments do not leak into text', !text.includes('must not leak'), text.slice(0, 80))
  check('doctype does not leak into text', !text.includes('doctype'), text.slice(0, 40))

  const meta = extractMeta(html)
  eq('og:title extracted', meta['og:title'], 'Salsa Social')

  const ld = extractJsonLd(html)
  eq('json-ld block parsed', ld.length, 1)

  const links = extractLinks(html)
  eq('link extracted', links[0]?.href, '/events/salsa')

  const events = extractEvents(html, 'https://example.com/e', 'America/New_York')
  eq('event extracted from json-ld', events.length, 1)
  eq('json-ld local date', events[0]?.localDate, '2027-03-05')
  eq('json-ld local time', events[0]?.localTime, '23:00')
  eq('json-ld method', events[0]?.extractionMethod, 'JSONLD')
}

// ── Dedupe ─────────────────────────────────────────────────────────────────
section('Entity resolution')

{
  eq('canonical url strips tracking', canonicalUrl('https://www.Example.com/events/?utm_source=x#top'), 'https://example.com/events')
}

{
  const candidate: ExtractedEvent = {
    title: 'Beginners Salsa CLT',
    styles: ['Salsa'],
    venueName: 'Venue A',
    localDate: '2026-12-02',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://example.com/schedule',
    foundFields: ['title', 'startDateTime'],
    extractionMethod: 'HTML',
  }
  const sameOccurrence = proposeMatches(candidate, [
    { id: 'event:1', title: 'Beginners Salsa CLT', sourceUrl: 'https://example.com/schedule', localDate: '2026-12-02', localTime: '19:00' },
  ])
  check('same url + same date → deterministic duplicate', sameOccurrence[0]?.deterministic === true, sameOccurrence)

  const weeklySibling = proposeMatches(candidate, [
    { id: 'event:2', title: 'Beginners Salsa CLT', sourceUrl: 'https://example.com/schedule', localDate: '2026-11-25', localTime: '19:00' },
  ])
  check('same url + different week → series, not duplicate', weeklySibling[0]?.matchType === 'SERIES' && !weeklySibling[0].deterministic, weeklySibling)

  const differentVenue = proposeMatches(candidate, [
    { id: 'event:3', title: 'Beginners Salsa CLT', sourceUrl: 'https://other.com/x', localDate: '2026-12-02', localTime: '19:00', venueName: 'Elsewhere' },
  ])
  check('different venue is not a duplicate', !differentVenue.some(m => m.deterministic), differentVenue)
}

{
  const key = dedupeKey({
    title: 'Salsa Social',
    styles: [],
    localDate: '2026-12-02',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://a.com',
    foundFields: [],
    extractionMethod: 'HTML',
  })
  eq('dedupe key is stable', key, dedupeKey({
    title: 'Salsa Social!',
    styles: [],
    localDate: '2026-12-02',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://b.com',
    foundFields: [],
    extractionMethod: 'HTML',
  }))
}

// ── QA ─────────────────────────────────────────────────────────────────────
section('Quality assurance')

{
  const base: ExtractedEvent = {
    title: 'Salsa Social',
    styles: ['Salsa'],
    venueName: 'The Loft',
    address: '123 Main St, Charlotte, NC 28203',
    localDate: '2027-03-05',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://example.com/x',
    foundFields: ['title', 'startDateTime', 'venueName', 'address'],
    extractionMethod: 'JSONLD',
  }
  const good = validateEvent(base, { now: new Date('2026-11-04T00:00:00Z'), pageText: 'salsa dance social at the loft' })
  check('good record passes QA', good.status === 'PASS', good)

  const old = validateEvent({ ...base, localDate: '2020-01-01' }, { now: new Date('2026-11-04T00:00:00Z'), pageText: 'salsa' })
  check('past event is rejected', old.status === 'REJECT', old.reasons)

  const blocked = validateEvent(base, { now: new Date('2026-11-04T00:00:00Z'), robotsAllowed: false })
  check('robots-blocked source is rejected', blocked.status === 'REJECT', blocked.reasons)

  const noSource = validateEvent({ ...base, sourceUrl: '' }, { now: new Date('2026-11-04T00:00:00Z') })
  check('missing source url is rejected', noSource.status === 'REJECT', noSource.reasons)

  const unbounded = validateEvent({ ...base, isRecurring: true, recurrenceRule: { rrule: 'FREQ=WEEKLY', interval: 1, byDay: [3], exceptions: [], timeZone: 'America/New_York', confidence: 0.9 }, recurrenceConfidence: 0.9 }, { now: new Date('2026-11-04T00:00:00Z'), pageText: 'salsa' })
  check('unbounded recurring claim is quarantined', unbounded.status === 'QUARANTINE', unbounded.reasons)
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`${'─'.repeat(60)}\n`)
process.exitCode = failed > 0 ? 1 : 0
