/**
 * Should Atlas spend an LLM call on this page?
 *
 * The long tail is expensive, so the gate is deliberately strict. A page
 * qualifies only when it looks like a dance event listing AND the
 * deterministic pass found nothing on it.
 *
 * The checks are cheap string signals, not a model call.
 */
import { stripHtml } from './parsers/html'

const LISTING_URL_HINTS = [
  'event', 'calendar', 'schedule', 'class', 'social', 'milonga', 'practica',
  'workshop', 'festival', 'party', 'lesson', 'upcoming', 'gatherings',
]

const DANCE_WORDS = [
  'salsa', 'bachata', 'kizomba', 'zouk', 'tango', 'milonga', 'ballroom',
  'cumbia', 'shag', 'swing', 'dance', 'dancing', 'social', 'class', 'lesson',
  'practica', 'workshop', 'festival',
]

/**
 * True when the page looks like it lists dance events.
 *
 * Two conditions must both hold:
 *   1. The URL or page text carries listing language (event, calendar, class…).
 *   2. The page carries dance language.
 *
 * A single generic word is not enough: "class" on a page about school timetables
 * is not a dance class listing.
 */
export function looksLikeEventListing(html: string, url: string): boolean {
  const path = safePath(url)
  const urlSignal = LISTING_URL_HINTS.some(h => path.includes(h))

  const { text } = stripHtml(html)
  const sample = text.slice(0, 6000).toLowerCase()

  const listingSignal =
    urlSignal ||
    /\b(events?|calendar|schedule|upcoming|classes?|socials?|milonga|practica|workshops?|festivals?)\b/.test(sample)

  if (!listingSignal) return false

  const danceSignal = DANCE_WORDS.some(w => sample.includes(w))
  return danceSignal
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}
