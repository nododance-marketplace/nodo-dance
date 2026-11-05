/**
 * US state names and abbreviations.
 *
 * Nominatim returns full state names ("North Carolina"); the database and
 * the site both use the two-letter USPS abbreviation ("NC"). This is the one
 * place that conversion happens.
 */

export const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'puerto rico': 'PR',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  'virgin islands': 'VI',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
}

/**
 * Normalise a state to its two-letter abbreviation.
 *
 * Accepts a full name ("North Carolina"), an abbreviation in any case
 * ("nc"), or a value that already contains a city prefix ("Charlotte, NC").
 * Returns null when the state cannot be identified — callers must treat that
 * as "unknown", never as a guess.
 */
export function stateAbbreviation(input: string | null | undefined): string | null {
  if (!input) return null
  const text = input.trim()
  if (!text) return null

  // Already an abbreviation: "Charlotte, NC" -> "NC", "NC" -> "NC".
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (/^[A-Za-z]{2}$/.test(last)) return last.toUpperCase()

  const full = US_STATE_ABBREVIATIONS[text.toLowerCase()]
  if (full) return full

  return null
}

/**
 * The state the site is built around.
 *
 * NEXT_PUBLIC_CITY is written as "Charlotte, NC". Everything published for
 * that state is shown; anything else belongs to another market.
 *
 * Returns null when the value is missing or unparseable, which callers treat
 * as "do not filter" rather than "filter to nothing".
 */
export function siteState(): string | null {
  return stateAbbreviation(process.env.NEXT_PUBLIC_CITY)
}
