/**
 * Extraction (Atlas Agent C).
 *
 * Ladder, cheapest first:
 *   0. JSON-LD (schema.org Event)  — typed, authoritative, free
 *   1. RSS / Atom feed               — structured, free
 *   2. iCalendar (.ics)              — structured, free
 *   3. Heuristic HTML scan           — date-anchored blocks, free
 *   4. LLM extraction (ScrapeGraphAI) — only when the deterministic pass
 *      returns too few fields; disabled unless explicitly enabled.
 *
 * Rule: never invent a field that is not on the page. Missing means missing.
 */
import { detectEventType, detectStyles, parsePrice } from '../normalize'
import { detectRecurrence, addDays, dayOfWeek } from '../recurrence'
import { findAddress, findCityStateZip, findVenueName, looksLikeAddress } from '../location'
import { findRecurrencePhrase, parseDateTime, parseTime } from './dates'
import { extractJsonLd, extractLinks, extractMeta, findEnclosingTag, findNearestHeading, isGenericTitle, stripHtml, stripLeadingTime, stripMarkup, tidy } from './html'
import type { DanceStyle, ExtractedEvent, ExtractedSchool, ExtractionMethod, FieldEvidence } from '../types'

const EVENT_TYPE_HINTS: Array<[RegExp, string]> = [
  [/\bsalsa\b/i, 'Salsa'],
  [/\bbachata\b/i, 'Bachata'],
  [/\bkizomba\b/i, 'Kizomba'],
  [/\bsemba\b/i, 'Kizomba'],
  [/\bzouk\b/i, 'Zouk'],
  [/\btango\b/i, 'Tango'],
  [/\bmilonga\b/i, 'Tango'],
  [/\bcumbia\b/i, 'Cumbia'],
  [/\bshag\b/i, 'Carolina Shag'],
  [/\bbalboa\b/i, 'Balboa'],
  [/\bwest\s*coast\s*swing\b/i, 'West Coast Swing'],
  [/\bballroom\b/i, 'Ballroom'],
  [/\bline\s*danc/i, 'Country Line Dancing'],
]

/**
 * Extract structured events from a page using the deterministic ladder.
 * `timeZone` is the venue's zone (from the source record or city default).
 */
export function extractEvents(
  html: string,
  url: string,
  timeZone: string,
  options: { referenceDate?: Date; minFields?: number } = {}
): ExtractedEvent[] {
  const referenceDate = options.referenceDate ?? new Date()
  const results: ExtractedEvent[] = []

  const jsonLd = extractJsonLdFrom(html)
  results.push(...fromJsonLd(jsonLd, url, timeZone, referenceDate))

  if (results.length === 0) {
    results.push(...fromFeeds(html, url, timeZone, referenceDate))
  }
  if (results.length === 0) {
    results.push(...fromHtml(html, url, timeZone, referenceDate))
  }

  return results.filter(e => e.title && e.title.length > 2)
}

// ── JSON-LD ────────────────────────────────────────────────────────────────

function extractJsonLdFrom(html: string): any[] {
  return extractJsonLd(html)
}

function flattenLd(node: any): any[] {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(flattenLd)
  if (typeof node !== 'object') return []
  const out: any[] = []
  const graph = node['@graph']
  if (Array.isArray(graph)) out.push(...graph.flatMap(flattenLd))
  out.push(node)
  return out
}

function ldType(node: any): string[] {
  const t = node['@type']
  if (!t) return []
  return Array.isArray(t) ? t.map(String) : [String(t)]
}

function fromJsonLd(blocks: any[], url: string, timeZone: string, referenceDate: Date): ExtractedEvent[] {
  const events: ExtractedEvent[] = []
  for (const node of flattenLd(blocks)) {
    const types = ldType(node).map(t => t.toLowerCase())
    if (!types.includes('event')) continue

    const title = tidy(String(node.name ?? ''))
    if (!title) continue

    const description = stripMarkup(String(node.description ?? ''))
    const startRaw = node.startDate ? String(node.startDate) : ''
    const endRaw = node.endDate ? String(node.endDate) : ''

    let localDate: string | undefined
    let localTime: string | undefined
    let endLocalDate: string | undefined
    let localEndTime: string | undefined
    let parsedStart: Date | undefined

    if (startRaw) {
      const parsed = new Date(startRaw)
      if (!Number.isNaN(parsed.getTime())) {
        parsedStart = parsed
        // Local wall time as published in the source's own offset.
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(parsed)
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
        localDate = `${get('year')}-${get('month')}-${get('day')}`
        localTime = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
      }
    }
    if (endRaw) {
      const parsed = new Date(endRaw)
      if (!Number.isNaN(parsed.getTime())) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(parsed)
        const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
        endLocalDate = `${get('year')}-${get('month')}-${get('day')}`
        localEndTime = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
      }
    }

    const location = node.location ?? {}
    const rawAddress = location.address ?? location
    const addressLine =
      typeof rawAddress === 'object' ? rawAddress.streetAddress : rawAddress
    const addressCity = typeof rawAddress === 'object' ? rawAddress.addressLocality : undefined
    const addressRegion = typeof rawAddress === 'object' ? rawAddress.addressRegion : undefined
    const addressPostal = typeof rawAddress === 'object' ? rawAddress.postalCode : undefined
    const venueName = tidy(String(location.name ?? '')) || undefined
    // Only keep an address that actually reads like one.
    const usableAddress = looksLikeAddress(addressLine) ? tidy(String(addressLine)) : undefined

    const organizer = node.organizer
    const organizerName =
      typeof organizer === 'string'
        ? tidy(organizer)
        : tidy(String(organizer?.name ?? '')) || undefined

    const priceRaw = node.offers
      ? Array.isArray(node.offers)
        ? node.offers[0]?.price
        : node.offers.price
      : undefined
    const { price, priceText } = parsePrice(priceRaw != null ? String(priceRaw) : undefined)

    const haystack = [title, description, organizerName ?? '', venueName ?? ''].join(' ')
    const styles = detectStyles(haystack)

    const recurrenceText = findRecurrencePhrase([description, title].join(' '))
    const recurrence = detectRecurrence(recurrenceText, localDate, timeZone)

    let eventType = detectEventType(haystack) ?? undefined
    // A recurring published session with no other signal is a class.
    if (!eventType && recurrence.isRecurring) eventType = 'GROUP_CLASS'

    const foundFields = [
      'title',
      startRaw ? 'startDateTime' : null,
      description ? 'description' : null,
      venueName ? 'venueName' : null,
      usableAddress ? 'address' : null,
      organizerName ? 'organizerName' : null,
      priceRaw != null ? 'price' : null,
      recurrenceText ? 'recurrence' : null,
    ].filter(Boolean) as string[]

    events.push({
      title,
      description: description || undefined,
      eventType,
      styles: styles.length ? styles : (['Other'] as DanceStyle[]),
      otherStyle: styles.length ? undefined : title,
      localDate,
      localTime,
      endLocalDate,
      localEndTime,
      timeZone,
      isRecurring: recurrence.isRecurring,
      recurrenceText,
      recurrenceRule: recurrence.rule,
      recurrenceConfidence: recurrence.confidence,
      venueName,
      address: usableAddress,
      city: addressCity ? tidy(String(addressCity)) : undefined,
      state: addressRegion ? tidy(String(addressRegion)) : undefined,
      zip: addressPostal ? tidy(String(addressPostal)) : undefined,
      price,
      priceText,
      organizerName,
      registrationUrl: typeof node.url === 'string' ? node.url : undefined,
      sourceUrl: url,
      sourceUrlCanonical: typeof node.url === 'string' ? node.url : undefined,
      foundFields,
      extractionMethod: 'JSONLD',
      evidence: buildEvidence(node, url),
    })
  }
  return events
}

function buildEvidence(node: any, url: string): FieldEvidence[] {
  const evidence: FieldEvidence[] = []
  const push = (field: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return
    evidence.push({ field, value: String(value), method: 'JSONLD', excerpt: undefined })
  }
  push('title', node.name)
  push('description', node.description)
  push('startDateTime', node.startDate)
  push('endDateTime', node.endDate)
  push('venueName', node.location?.name)
  push('address', node.location?.address?.streetAddress ?? node.location?.address)
  push('organizerName', node.organizer?.name ?? node.organizer)
  push('registrationUrl', node.url)
  return evidence
}

// ── RSS / Atom ─────────────────────────────────────────────────────────────

function fromFeeds(html: string, url: string, timeZone: string, referenceDate: Date): ExtractedEvent[] {
  const events: ExtractedEvent[] = []

  // RSS <item>
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(html))) {
    const item = m[0]
    const title = tidy(stripTags(item, 'title'))
    if (!title) continue
    const link = stripTags(item, 'link')
    const description = tidy(stripTags(item, 'description') || stripTags(item, 'content:encoded'))
    const pubDate = stripTags(item, 'pubDate') || stripTags(item, 'dc:date')

    const when = parseDateTime(`${pubDate} ${description}`, referenceDate)
    const recurrenceText = findRecurrencePhrase(`${title} ${description}`)
    const recurrence = detectRecurrence(recurrenceText, when.date, timeZone)
    const haystack = `${title} ${description}`
    const styles = detectStyles(haystack)

    events.push({
      title,
      description: description || undefined,
      eventType: detectEventType(haystack) ?? undefined,
      styles: styles.length ? styles : (['Other'] as DanceStyle[]),
      localDate: when.date,
      localTime: when.time,
      localEndTime: when.endTime,
      timeZone,
      isRecurring: recurrence.isRecurring,
      recurrenceText,
      recurrenceRule: recurrence.rule,
      recurrenceConfidence: recurrence.confidence,
      sourceUrl: link || url,
      sourceUrlCanonical: link || url,
      registrationUrl: link || undefined,
      foundFields: ['title', when.date ? 'startDateTime' : null, description ? 'description' : null].filter(Boolean) as string[],
      extractionMethod: 'RSS',
    })
  }

  // iCalendar
  if (events.length === 0 && /BEGIN:VEVENT/.test(html)) {
    events.push(...fromICal(html, url, timeZone, referenceDate))
  }

  return events
}

function stripTags(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const found = re.exec(xml)?.[1]
  if (!found) return ''
  return decodeEntitiesSafe(found.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).trim()
}

function decodeEntitiesSafe(input: string): string {
  return input
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

function unescapeIcal(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function fromICal(text: string, url: string, timeZone: string, referenceDate: Date): ExtractedEvent[] {
  const events: ExtractedEvent[] = []
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1)
  for (const block of blocks) {
    const field = (name: string): string | undefined => {
      const re = new RegExp(`^${name}[^:]*:(.*)$`, 'im')
      const found = re.exec(block)
      return found ? unescapeIcal(found[1]) : undefined
    }
    const summary = field('SUMMARY')
    if (!summary) continue
    const dtstart = field('DTSTART')
    const rrule = field('RRULE')

    let localDate: string | undefined
    let localTime: string | undefined
    if (dtstart) {
      const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(dtstart)
      if (m) {
        localDate = `${m[1]}-${m[2]}-${m[3]}`
        localTime = m[4] ? `${m[4]}:${m[5]}` : undefined
      }
    }

    const description = field('DESCRIPTION')
    const location = field('LOCATION')
    const recurrenceText = rrule ? `rrule:${rrule}` : findRecurrencePhrase(`${summary} ${description ?? ''}`)
    const recurrence = detectRecurrence(recurrenceText, localDate, timeZone)
    const haystack = `${summary} ${description ?? ''} ${location ?? ''}`
    const styles = detectStyles(haystack)

    events.push({
      title: summary,
      description: description || undefined,
      eventType: detectEventType(haystack) ?? undefined,
      styles: styles.length ? styles : (['Other'] as DanceStyle[]),
      localDate,
      localTime,
      timeZone,
      isRecurring: recurrence.isRecurring || Boolean(rrule),
      recurrenceText,
      recurrenceRule: recurrence.rule,
      recurrenceConfidence: recurrence.confidence,
      venueName: location || undefined,
      sourceUrl: field('URL') || url,
      sourceUrlCanonical: field('URL') || url,
      foundFields: ['title', localDate ? 'startDateTime' : null, location ? 'venueName' : null].filter(Boolean) as string[],
      extractionMethod: 'ICAL',
    })
  }
  return events
}

// ── Heuristic HTML ─────────────────────────────────────────────────────────

/**
 * Scan a page for date-anchored blocks. This is the fallback for pages with no
 * structured data. It deliberately produces candidates that are missing more
 * fields — the QA stage scores them lower and they surface for review.
 */
function fromHtml(html: string, url: string, timeZone: string, referenceDate: Date): ExtractedEvent[] {
  const { text, offsets } = stripHtml(html)
  const links = extractLinks(html)
  const meta = extractMeta(html)
  const events: ExtractedEvent[] = []

  const dateRe =
    /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/gi

  const seen = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = dateRe.exec(text))) {
    const start = match.index
    const contextBefore = text.slice(Math.max(0, start - 260), start)
    const contextAfter = text.slice(start, start + 220)
    const block = `${contextBefore} ${match[0]} ${contextAfter}`.trim()

    // Find the nearest preceding link with meaningful text → likely the title.
    let bestLink: { href: string; text: string } | null = null
    // Use the closest link whose text appears inside the preceding context.
    for (const link of links) {
      if (link.text.length < 3) continue
      const idx = contextBefore.lastIndexOf(link.text)
      if (idx !== -1) {
        bestLink = { href: link.href, text: link.text }
      }
    }

    const title = pickTitle(bestLink?.text, contextBefore, html, meta, offsets[start] ?? html.length)
    if (!title || title.length < 3) continue

    const key = `${title.toLowerCase()}|${match[0]}`
    if (seen.has(key)) continue
    seen.add(key)

    const when = parseDateTime(block, referenceDate)
    if (!when.date) continue

    const recurrenceText = findRecurrencePhrase(block)
    const recurrence = detectRecurrence(recurrenceText, when.date, timeZone)
    const haystack = `${title} ${block}`
    const styles = detectStyles(haystack)
    const eventType = detectEventType(haystack) ?? undefined
    const { price, priceText } = parsePrice(block)
    const pageAddress = findAddress(contextAfter) ?? findAddress(text)
    const pagePlace = findCityStateZip(text)
    const pageVenue = findVenueName(contextAfter) ?? findVenueName(text)

    let resolvedUrl = url
    if (bestLink?.href) {
      try {
        resolvedUrl = new URL(bestLink.href, url).toString()
      } catch {
        resolvedUrl = url
      }
    }

    events.push({
      title: tidy(title),
      description: tidy(contextAfter.slice(0, 200)) || undefined,
      eventType,
      styles: styles.length ? styles : (['Other'] as DanceStyle[]),
      localDate: when.date,
      localTime: when.time,
      localEndTime: when.endTime,
      timeZone,
      isRecurring: recurrence.isRecurring,
      recurrenceText,
      recurrenceRule: recurrence.rule,
      recurrenceConfidence: recurrence.confidence,
      price,
      priceText,
      venueName: pageVenue,
      address: pageAddress,
      city: pagePlace.city,
      state: pagePlace.state,
      zip: pagePlace.zip,
      sourceUrl: resolvedUrl,
      sourceUrlCanonical: resolvedUrl,
      foundFields: ['title', 'startDateTime', pageVenue ? 'venueName' : null, pageAddress ? 'address' : null].filter(Boolean) as string[],
      extractionMethod: 'HTML',
    })
  }

  if (events.length === 0) {
    // Weekday-schedule pages ("Tango Wednesdays", "Every Thursday at 8pm")
    // carry no calendar date. Emit a recurring candidate anchored to the next
    // matching weekday instead of dropping the listing entirely.
    const weekday = fromWeekdaySchedule(html, url, timeZone, referenceDate)
    if (weekday) events.push(weekday)
  }

  if (events.length === 0 && meta['og:title']) {
    // Page-level fallback: the page itself is an event.
    const when = parseDateTime(text.slice(0, 2000), referenceDate)
    if (when.date) {
      const haystack = `${meta['og:title'] ?? ''} ${meta['og:description'] ?? ''} ${text.slice(0, 1500)}`
      const styles = detectStyles(haystack)
      events.push({
        title: tidy(meta['og:title']),
        description: meta['og:description'] ? tidy(meta['og:description']) : undefined,
        eventType: detectEventType(haystack) ?? undefined,
        styles: styles.length ? styles : (['Other'] as DanceStyle[]),
        localDate: when.date,
        localTime: when.time,
        timeZone,
        isRecurring: false,
        recurrenceConfidence: 0,
        sourceUrl: url,
        foundFields: ['title', 'startDateTime'].filter(Boolean) as string[],
        extractionMethod: 'HTML',
      })
    }
  }

  return events
}

/**
 * Extract a recurring candidate from a page that names weekdays rather than
 * calendar dates. The occurrence date is the next matching weekday from the
 * reference date — it is a starting point for a series, not a claim that the
 * event happens on that exact day forever.
 */
function fromWeekdaySchedule(
  html: string,
  url: string,
  timeZone: string,
  referenceDate: Date
): ExtractedEvent | null {
  const { text } = stripHtml(html)
  const title =
    tidy(extractMeta(html)['og:title'] ?? '') ||
    tidy(text.slice(0, 120).split(/\s{2,}|\|/)[0] ?? '')
  if (!title || title.length < 3) return null

  const recurrenceText = findRecurrencePhrase(text.slice(0, 4000))
  if (!recurrenceText) return null

  const recurrence = detectRecurrence(recurrenceText, undefined, timeZone)
  if (!recurrence.isRecurring || !recurrence.rule || recurrence.rule.byDay.length === 0) return null

  // Next matching weekday from the reference date.
  const refIso = referenceDate.toISOString().slice(0, 10)
  const anchor = addDays(refIso, 1)
  let occurrence = anchor
  for (let i = 0; i < 8; i++) {
    if (recurrence.rule.byDay.includes(dayOfWeek(occurrence))) break
    occurrence = addDays(occurrence, 1)
  }

  const when = parseTime(text.slice(0, 4000))
  const haystack = `${title} ${text.slice(0, 3000)}`
  const styles = detectStyles(haystack)
  const address = findAddress(text)
  const place = findCityStateZip(text)
  const venueName = findVenueName(text)

  return {
    title,
    description: tidy(text.slice(0, 240)) || undefined,
    eventType: detectEventType(haystack) ?? undefined,
    styles: styles.length ? styles : (['Other'] as DanceStyle[]),
    localDate: occurrence,
    localTime: when.time,
    timeZone,
    isRecurring: true,
    recurrenceText,
    recurrenceRule: recurrence.rule,
    recurrenceConfidence: recurrence.confidence,
    venueName,
    address,
    city: place.city,
    state: place.state,
    zip: place.zip,
    sourceUrl: url,
    foundFields: ['title', 'startDateTime', 'recurrence', venueName ? 'venueName' : null, address ? 'address' : null].filter(Boolean) as string[],
    extractionMethod: 'HTML',
  }
}

function firstLine(text: string): string {
  const cleaned = tidy(text)
  const parts = cleaned.split(/[|·—–•]|\s{2,}/)
  for (const part of parts) {
    const t = part.trim()
    if (t.length >= 4 && t.length <= 140) return t
  }
  return ''
}

/**
 * Choose the best title for a listing block:
 *   1. the anchor text, when it is not a generic call-to-action
 *   2. the nearest preceding heading
 *   3. the first meaningful line of the block
 * Always with a leading clock time removed.
 */
function pickTitle(
  linkText: string | undefined,
  contextBefore: string,
  html: string,
  meta: Record<string, string>,
  htmlOffset: number
): string | undefined {
  const cleaned = (value: string): string => stripLeadingTime(tidy(value))

  if (linkText) {
    const candidate = cleaned(linkText)
    if (!isGenericTitle(candidate)) return candidate
  }

  const heading = findNearestHeading(html, htmlOffset)
  if (heading) {
    const candidate = cleaned(heading)
    if (!isGenericTitle(candidate)) return candidate
  }

  const line = cleaned(firstLine(contextBefore))
  if (line && !isGenericTitle(line)) return line

  const og = meta['og:title'] ? cleaned(meta['og:title']) : ''
  if (og && !isGenericTitle(og)) return og

  return undefined
}

// ── School / studio extraction ─────────────────────────────────────────────

/** Extract a school/business record from a page. */
export function extractSchool(
  html: string,
  url: string,
  timeZone: string
): ExtractedSchool | null {
  const meta = extractMeta(html)
  const blocks = extractJsonLd(html)
  const nodes = flattenLd(blocks)
  const org = nodes.find(n => ldType(n).map(t => t.toLowerCase()).some(t => t === 'organization' || t === 'localbusiness' || t === 'danceschool'))
  const { text } = stripHtml(html)

  const businessName =
    tidy(org?.name ?? '') ||
    tidy(meta['og:site_name'] ?? '') ||
    tidy(meta['og:title'] ?? '').replace(/\s*[|–—-]\s*[^|–—-]{0,30}$/, '') ||
    ''

  const address = org?.address
  const street = typeof address === 'object' ? address?.streetAddress : undefined
  const city = typeof address === 'object' ? address?.addressLocality : undefined
  const region = typeof address === 'object' ? address?.addressRegion : undefined
  const postal = typeof address === 'object' ? address?.postalCode : undefined

  const phone = tidy(org?.telephone ?? '') || (/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/.exec(text)?.[0] ?? '')

  const styles = detectStyles(`${businessName} ${text.slice(0, 6000)}`)
  const links = extractLinks(html)
  const scheduleLink = links.find(l => /class|schedule|calendar|group/i.test(l.href) && l.text.length > 0)?.href
  const instructorLink = links.find(l => /instructor|teacher|staff|bio/i.test(l.href) && l.text.length > 0)?.href

  if (!businessName) return null

  return {
    businessName,
    websiteUrl: typeof org?.url === 'string' ? org.url : url,
    address: street ? tidy(String(street)) : undefined,
    city: city ? tidy(String(city)) : undefined,
    state: region ? tidy(String(region)) : undefined,
    zip: postal ? tidy(String(postal)) : undefined,
    phone: phone || undefined,
    contactChannel: phone ? 'phone' : undefined,
    styles,
    classScheduleUrl: scheduleLink ? absolute(scheduleLink, url) : undefined,
    instructorDirectoryUrl: instructorLink ? absolute(instructorLink, url) : undefined,
    sourceUrl: url,
    foundFields: ['businessName'],
    extractionMethod: 'HTML',
  }
}

function absolute(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}
