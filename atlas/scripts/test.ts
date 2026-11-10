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
import { extractJsonLd, extractLinks, extractMeta, stripHtml, findNearestHeading } from '../lib/parsers/html'
import { extractEvents } from '../lib/parsers/extract'
import { looksLikeEventPage, isPastEventUrl } from '../lib/sitemap'
import { findSocialLinks } from '../lib/social'
import { validateEvent } from '../lib/qa'
import { sanitizeForDb } from '../lib/pipeline'
import { parseDanceUsCalendarLink } from '../lib/channels'
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
eq('a padded morning time is 24-hour', parseTime('Meeting at 09:30 sharp').time, '09:30')
eq('an unpadded 12-hour time with no meridiem is ambiguous', parseTime('Doors 7:45').time, undefined)
eq('an unpadded 12-hour time takes a nearby meridiem', parseTime('Doors 7:45 pm').time, '19:45')
eq('an unpadded morning time takes a nearby meridiem', parseTime('Doors 7:45 am').time, '07:45')
eq('time range end', parseTime('Open 7:00 PM - 10:00 PM').endTime, '22:00')
eq('bare hour range', parseTime('Doors 6-9pm').time, '18:00')
check('recurrence phrase found', findRecurrencePhrase('Tango every Wednesday at 8pm') !== undefined)
check('no recurrence phrase in plain text', findRecurrencePhrase('Come learn salsa with us tonight') === undefined)

{
  // A range with no meridiem is ambiguous. "5 - 9" is morning or evening
  // and we do not guess.
  eq('an unqualified range yields no time', parseTime('Doors 5 - 9').time, undefined)
  eq('an unqualified range yields no end time', parseTime('Doors 5 - 9').endTime, undefined)
  eq('a qualified range still works', parseTime('Doors 5 - 9 pm').time, '17:00')
  eq('a meridiem on the range start is kept', parseTime('Doors 7pm until 9').time, '19:00')
  eq('a meridiem before the range applies to it', parseTime('PM doors 5 - 9').time, '17:00')
}

{
  // The time must belong to this event. A page listing a dozen events puts
  // a dozen times in it; a time far from the date is a neighbour's.
  const crowded =
    'March 5, 2027 Meraki! Salsa Social. Doors open. Moonshine November 1, 2026 4:30 - 9 pm | 4 Level 1 Mambo on Monday'
  const parsed = parseDateTime(crowded, new Date('2026-11-05T00:00:00Z'))
  eq('the date is found', parsed.date, '2027-03-05')
  eq('a neighbouring event time is not taken', parsed.time, undefined)

  const own = 'March 5, 2027 doors open at 7:30 PM'
  eq('a time next to the date is taken', parseDateTime(own, new Date('2026-11-05T00:00:00Z')).time, '19:30')
}

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
  eq(
    'the city is the last segment, not the street',
    findCityStateZip('1711 S. Broad Street, Philadelphia, PA').city,
    'Philadelphia'
  )
  eq(
    'the city is still found with a street in front',
    findCityStateZip('2935 Griffith St, Charlotte, NC 28203').city,
    'Charlotte'
  )
  eq('a state and zip still work', findCityStateZip('Austin, TX 78701').state, 'TX')
  eq(
    'a phrase in front of the city is trimmed away',
    findCityStateZip('134 Halton Road Greenville INSTRUCTION IN GREENVILLE, SC').city,
    'GREENVILLE'
  )
  check('venue name found', (findVenueName('Venue: The Loft at 5th Street') ?? '').includes('Loft'))
  check('no false venue from weekday', !/^(mon|tue)/i.test(findVenueName('Monday Class') ?? ''))

  // An address runs into the next thing on the page.
  eq(
    'an address stops at a note',
    findAddress('1711 S. Broad Street (entrance on Castle Ave) Payments: click to pay'),
    '1711 S. Broad Street'
  )
  eq(
    'an address stops at a price',
    findAddress('6305 SE Foster Rd Cost: $20 for members'),
    '6305 SE Foster Rd'
  )
  eq(
    'an address stops at registration',
    findAddress('2525 W Anderson Ln Register at the front desk'),
    '2525 W Anderson Ln'
  )

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

// ── Extraction quality ─────────────────────────────────────────────────────
// The defects these cover were all found by reading the production review
// queue: navigation text became titles, paragraphs became prices, and links
// to other people's pages became the source of the record.
section('Extraction quality')

{
  // A JSON-LD name is not always an event.
  const generic = `<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"Event","name":"here","startDate":"2027-03-05T23:00:00-05:00"}</script>
    </head><body></body></html>`
  eq('json-ld generic title is skipped', extractEvents(generic, 'https://example.com/x', 'America/New_York').length, 0)
}

{
  // A structured address must not be stored as "[object Object]".
  const structured = `<!doctype html><html><head>
    <script type="application/ld+json">{"@type":"Event","name":"Salsa Social","startDate":"2027-03-05T23:00:00-05:00",
    "location":{"name":"The Loft","address":{"streetAddress":"123 Main St","addressLocality":"Charlotte","addressRegion":"NC","postalCode":"28203"}}}</script>
    </head><body></body></html>`
  const events = extractEvents(structured, 'https://example.com/x', 'America/New_York')
  eq('json-ld address object extracted', events[0]?.address, '123 Main St')
  eq('json-ld city extracted', events[0]?.city, 'Charlotte')
  const addressEvidence = events[0]?.evidence?.find(e => e.field === 'address')
  check('json-ld address evidence is text', addressEvidence?.value.includes('123 Main St') === true, addressEvidence?.value)
  check('no evidence says [object Object]', !(events[0]?.evidence?.some(e => e.value.includes('[object')) ?? true))
}

{
  // A paragraph is not a price.
  const blob = 'This studio has been the heartbeat of dance education for over 40 years and we welcome everyone.'
  eq('a paragraph yields no price', parsePrice(blob).priceText, undefined)
  eq('a paragraph yields no price number', parsePrice(blob).price, undefined)

  const withPrice = 'Join us on Saturday November 14, 2026 from 5-9 pm. New student deal $60. All welcome.'
  eq('a price inside a paragraph is found', parsePrice(withPrice).price, 60)
  eq('the price text stays short', (parsePrice(withPrice).priceText ?? '').length <= 40, true)
  eq('the price text is the price', parsePrice(withPrice).priceText, '$60')

  eq('a bare amount is a price', parsePrice('20').price, 20)
  eq('free is a price phrase', parsePrice('Free').priceText, 'Free')
}

{
  // A link to another site is where to buy a ticket, not where the event was
  // found. The source of a record is the page we actually read.
  const offSite = `<!doctype html><html><body>
    <a href="https://www.instagram.com/reel/Deu21wAgEY1/">Meraki</a>
    <p>Saturday November 14, 2026 5-9 pm Salsa and Bachata at the studio</p>
    </body></html>`
  const events = extractEvents(offSite, 'https://majestyinmotion.com/', 'America/Los_Angeles')
  const event = events.find(e => e.title.includes('Meraki'))
  check('an off-site link does not become the source', event?.sourceUrl === 'https://majestyinmotion.com/', event?.sourceUrl)
  eq('an off-site link becomes the registration url', event?.registrationUrl, 'https://www.instagram.com/reel/Deu21wAgEY1/')
}

{
  // The record must carry its own dance signal, not borrow the page's.
  const ballet: ExtractedEvent = {
    title: 'Nutcracker Sweets',
    styles: ['Other'],
    venueName: 'BodyVox Dance Center',
    address: '1201 NW 17th Ave, Portland, OR 97209',
    localDate: '2027-03-05',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://bodyvox.org/shows',
    foundFields: ['title', 'startDateTime', 'localDate', 'localTime', 'venueName', 'address'],
    extractionMethod: 'HTML',
  }
  const result = validateEvent(ballet, {
    now: new Date('2026-11-04T00:00:00Z'),
    pageText: 'BodyVox Dance Center presents. Our season of contemporary dance and ballet.',
  })
  check('a record with no dance signal of its own is quarantined', result.status === 'QUARANTINE', result.reasons)
  check('the reason names the problem', result.reasons.some(r => r.includes('dance-related signal of its own')), result.reasons)
}

{
  // A dance record keeps its PASS.
  const social: ExtractedEvent = {
    title: 'Salsa Social at The Loft',
    styles: ['Salsa'],
    venueName: 'The Loft',
    address: '123 Main St, Charlotte, NC 28203',
    localDate: '2027-03-05',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://example.com/salsa',
    foundFields: ['title', 'startDateTime', 'localDate', 'localTime', 'venueName', 'address'],
    extractionMethod: 'HTML',
  }
  const result = validateEvent(social, {
    now: new Date('2026-11-04T00:00:00Z'),
    pageText: 'Salsa every Friday at The Loft.',
  })
  check('a dance record still passes', result.status === 'PASS', result.reasons)
}

{
  // "Ecstatic Dance" is a partner-dance format the canonical vocabulary has
  // no slot for. It must not be filtered out as "not a dance".
  const ecstatic: ExtractedEvent = {
    title: 'Rebirth Wednesdays! – Dance to remember who you are',
    styles: ['Other'],
    venueName: 'Austin Ecstatic Dance Center',
    address: '10203 Old Manchaca Road',
    localDate: '2027-03-05',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://austinecstaticdancecenter.com/',
    foundFields: ['title', 'startDateTime', 'localDate', 'localTime', 'venueName', 'address'],
    extractionMethod: 'JSONLD',
  }
  const result = validateEvent(ecstatic, {
    now: new Date('2026-11-04T00:00:00Z'),
    pageText: 'Wednesday Night Dance at the Austin Ecstatic Dance Center!',
  })
  check('an ecstatic dance event passes', result.status === 'PASS', result.reasons)
}

{
  // A venue that happens to be a dance center does not make every event at
  // it a dance event.
  const filmFest: ExtractedEvent = {
    title: 'Submit Your Film',
    styles: ['Other'],
    venueName: 'BodyVox Dance Center',
    address: '1201 NW 17th Ave, Portland, OR 97209',
    localDate: '2027-03-05',
    localTime: '19:00',
    isRecurring: false,
    recurrenceConfidence: 0,
    sourceUrl: 'https://bodyvox.org/film-festival',
    foundFields: ['title', 'startDateTime', 'localDate', 'localTime', 'venueName', 'address'],
    extractionMethod: 'JSONLD',
  }
  const result = validateEvent(filmFest, {
    now: new Date('2026-11-04T00:00:00Z'),
    pageText: 'BodyVox Dance Center presents the CineVox dance film festival.',
  })
  check('a film submission at a dance center is quarantined', result.status === 'QUARANTINE', result.reasons)
}

// ── Discovery ──────────────────────────────────────────────────────────────
// Sitemaps are the cheapest discovery channel there is, and they are also
// full of pages that are not events. The filter decides what is worth a
// crawl.
section('Source discovery')

{
  eq('a calendar path is an event page', looksLikeEventPage('https://x.com/calendar/salsabachata-11/20/2026'), true)
  eq('an event-details path is an event page', looksLikeEventPage('https://x.com/event-details/tipsy-tap-9'), true)
  eq('a class schedule is an event page', looksLikeEventPage('https://x.com/current-youth-adult-class-schedule/'), true)
  eq('a calendar page is an event page', looksLikeEventPage('https://x.com/studio-calendar/'), true)

  // The SEO article that is in every dance school's sitemap.
  eq('an article about choosing a class is not an event page', looksLikeEventPage('https://x.com/best-dance-classes-for-kids-what-parents-should-know/'), false)
  eq('a class description without a date is not an event page', looksLikeEventPage('https://x.com/kids-dance-classes-seattle-junior-ballet/'), false)
  eq('a class with a date in the url is an event page', looksLikeEventPage('https://x.com/kids-dance-classes-11-20-2026/'), true)

  eq('a blog post is not an event page', looksLikeEventPage('https://x.com/blog/2026/11/salsa-tips'), false)
  eq('a contact page is not an event page', looksLikeEventPage('https://x.com/contact/'), false)

  // A sitemap keeps listing last year's events.
  eq('a past event url is recognised as past', isPastEventUrl('https://x.com/event-details/spring-recital-2023-06-22-15-00', new Date('2026-11-05T00:00:00Z')), true)
  eq('a future event url is not past', isPastEventUrl('https://x.com/calendar/salsabachata-11-20-2026', new Date('2026-11-05T00:00:00Z')), false)
  eq('a url with no date is not past', isPastEventUrl('https://x.com/calendar/salsa', new Date('2026-11-05T00:00:00Z')), false)
}

{
  // The offsets have to line up with the text, or the heading lookup misses
  // and every event on a calendar page ends up with the page's title.
  const page = `<!doctype html><html><body>
    <div class="info">
      <h1 class="title"><a href="/calendar/go-west-11-10-2026">Go West: Weekly West Coast Swing Dance</a></h1>
      <ul><li><time datetime="2026-11-10">Tuesday, November 10, 2026   8:30 PM</time></li></ul>
    </div>
    <p>Some   navigation   text   with &amp; entities &amp; irregular spacing &rarr; more</p>
    </body></html>`

  const { text, offsets } = stripHtml(page)
  eq('entities are decoded', text.includes('&'), true)
  eq('an arrow entity is decoded', text.includes('→'), true)
  check('whitespace is collapsed', !text.includes('  '), text.slice(0, 60))
  eq('offsets line up with the text', offsets.length, text.length)

  const dateIndex = text.indexOf('November 10, 2026')
  check('the date is in the text', dateIndex > -1, text.slice(0, 80))
  eq('the offset points at the source', page.slice(offsets[dateIndex], offsets[dateIndex] + 6), 'Novemb')

  const heading = findNearestHeading(page, offsets[dateIndex])
  eq('the heading before the date is found', heading, 'Go West: Weekly West Coast Swing Dance')
}

// ── Social accounts ────────────────────────────────────────────────────────
// A studio links to its own social accounts from its own website. That is
// how we know where a small studio posts, when it has no website at all.
section('Social accounts')

{
  const html = `
    <a href="https://www.facebook.com/godance">Facebook</a>
    <a href="http://instagram.com/godancestudio">Instagram</a>
    <a href="https://www.tiktok.com/@godanceaustin">TikTok</a>
    <a href="https://www.youtube.com/godancestudio">YouTube</a>
    <a href="http://www.facebook.com/2008/fbml">xmlns</a>
    <a href="https://instagram.com/squarespace">built with</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
  `
  const links = findSocialLinks(html)
  const byPlatform = new Map(links.map((l) => [l.platform, l.url]))

  eq('the facebook account is found', byPlatform.get('facebook'), 'https://www.facebook.com/godance')
  eq('the instagram account is found', byPlatform.get('instagram'), 'https://instagram.com/godancestudio')
  eq('the tiktok account is found', byPlatform.get('tiktok'), 'https://www.tiktok.com/@godanceaustin')
  eq('the youtube account is found', byPlatform.get('youtube'), 'https://www.youtube.com/godancestudio')
  check('the xml namespace is not an account', !links.some((l) => l.url.includes('/2008/')))
  check('the website builder is not an account', !links.some((l) => l.url.includes('squarespace')))
  check('a share button is not an account', !links.some((l) => l.url.includes('sharer')))
  eq('a page with no links has none', findSocialLinks('<p>Nothing here</p>').length, 0)
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

  // "Closed: Thanksgiving" is a closure, not an event.
  const closed = validateEvent(
    { ...base, title: 'Closed: Thanksgiving', description: 'Closed: Thanksgiving' },
    { now: new Date('2026-11-04T00:00:00Z'), pageText: 'Closed: Thanksgiving' }
  )
  check('a closure notice is rejected', closed.status === 'REJECT', closed.reasons)
}

// ── Database sanitisation ──────────────────────────────────────────────────
// Measured against PostgreSQL 16 and the Prisma engine: a NUL byte and a lone
// surrogate are the only two things that make a write fail. Everything else
// is accepted, and must not be mangled.
section('Database sanitisation')

{
  eq('plain text is untouched', sanitizeForDb('Saturday Salsa Social'), 'Saturday Salsa Social')

  eq('valid \\u escape survives', sanitizeForDb('caf\\u00e9'), 'caf\\u00e9')

  eq('invalid \\u escape is left alone', sanitizeForDb('Bring your own \\u partner'), 'Bring your own \\u partner')

  eq('trailing lone backslash is removed', sanitizeForDb('path\\'), 'path')

  eq('control characters are stripped', sanitizeForDb('Sal\x00sa\x07 Social'), 'Salsa Social')

  eq('tab and newline survive', sanitizeForDb('Line one\nLine\ttwo'), 'Line one\nLine\ttwo')

  eq('null passes through', sanitizeForDb(null), null)

  eq('undefined passes through', sanitizeForDb(undefined), undefined)

  // A NUL byte makes Postgres reject the whole statement: 22021.
  check(
    'NUL byte never reaches the database',
    !sanitizeForDb('Sal\x00sa Social')!.includes('\x00'),
    sanitizeForDb('Sal\x00sa Social')
  )

  // A lone surrogate makes the Prisma engine fail before the query is sent.
  check(
    'lone surrogate never reaches the database',
    !/[\uD800-\uDFFF]/.test(sanitizeForDb('Sal\uD800sa Social')!),
    sanitizeForDb('Sal\uD800sa Social')
  )

  // A well-formed pair is a real character and must survive intact.
  eq('a valid surrogate pair survives', sanitizeForDb('Party \uD83C\uDF89 tonight'), 'Party \uD83C\uDF89 tonight')

  eq('a lone low surrogate is replaced', sanitizeForDb('Sal\uDC00sa'), 'Sal\uFFFDsa')

  // The sanitiser runs over already-JSON-encoded columns too, so it must
  // never turn valid JSON into invalid JSON.
  const rule = { rrule: 'FREQ=WEEKLY', originalText: 'Starts at C:\\u bar' }
  const encoded = JSON.stringify(rule)
  eq('JSON-encoded values survive unchanged', sanitizeForDb(encoded), encoded)
  check('JSON-encoded values stay parseable', (() => {
    try {
      JSON.parse(sanitizeForDb(encoded)!)
      return true
    } catch {
      return false
    }
  })())
}

// ── DanceUS world calendar link parsing ────────────────────────────────────
// The world registry ('london-uk', 'toronto-on-canada', 'puerto-rico') must
// resolve side by side with the US registry, without changing US behaviour.
section('DanceUS calendar link parsing')

function worldCase(url: string, citySlug: string, name: string, country: string, timeZone: string): void {
  const p = parseDanceUsCalendarLink(url)
  check(
    `${citySlug} (${country})`,
    !!p && p.citySlug === citySlug && p.city.name === name && p.city.country === country && p.city.timeZone === timeZone,
    p ? `${p.citySlug}|${p.city.name}|${p.city.country}|${p.city.timeZone}` : 'null'
  )
}

worldCase('https://danceus.org/events/salsa/london-uk-salsa-calendar/', 'london-uk', 'London', 'GB', 'Europe/London')
worldCase('https://danceus.org/events/salsa/barcelona-spain-salsa-calendar/', 'barcelona-spain', 'Barcelona', 'ES', 'Europe/Madrid')
worldCase('https://danceus.org/events/salsa/toronto-on-canada-salsa-calendar/', 'toronto-on-canada', 'Toronto', 'CA', 'America/Toronto')
worldCase('https://danceus.org/events/salsa/calgary-ab-canada-salsa-calendar/', 'calgary-ab-canada', 'Calgary', 'CA', 'America/Edmonton')
worldCase('https://danceus.org/events/salsa/vancouver-bc-canada-salsa-calendar/', 'vancouver-bc-canada', 'Vancouver', 'CA', 'America/Vancouver')
worldCase('https://danceus.org/events/salsa/cali-colombia-salsa-calendar/', 'cali-colombia', 'Cali', 'CO', 'America/Bogota')
worldCase('https://danceus.org/events/salsa/paris-france-salsa-calendar/', 'paris-france', 'Paris', 'FR', 'Europe/Paris')
worldCase('https://danceus.org/events/salsa/sydney-australia-salsa-calendar/', 'sydney-australia', 'Sydney', 'AU', 'Australia/Sydney')
worldCase('https://danceus.org/events/salsa/perth-australia-salsa-calendar/', 'perth-australia', 'Perth', 'AU', 'Australia/Perth')
worldCase('https://danceus.org/events/salsa/gold-coast-australia-salsa-calendar/', 'gold-coast-australia', 'Gold Coast', 'AU', 'Australia/Brisbane')
worldCase('https://danceus.org/events/salsa/puerto-rico-salsa-calendar/', 'puerto-rico', 'Puerto Rico', 'PR', 'America/Puerto_Rico')

// US shapes must keep parsing identically after the world registry landed.
worldCase('https://danceus.org/events/salsa/charlotte-nc-salsa-calendar/', 'charlotte-nc', 'Charlotte', 'US', 'America/New_York')
worldCase('https://danceus.org/events/tango/new-york-nyc-argentine-tango-calendar/', 'new-york-ny', 'New York', 'US', 'America/New_York')

// Anything outside both registries stays rejected.
eq('unknown world area is rejected', parseDanceUsCalendarLink('https://danceus.org/events/hip-hop/hip-hop-festivals-worldwide-hip-hop-calendar/'), null)

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`${'─'.repeat(60)}\n`)
process.exitCode = failed > 0 ? 1 : 0
