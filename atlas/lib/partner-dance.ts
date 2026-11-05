/**
 * Is this a partner dance business?
 *
 * Nodo is a partner dance directory: salsa, bachata, tango, kizomba, zouk,
 * west coast swing, ballroom, cumbia. A ballet school, a jazz studio and a
 * sandwich shop are all places with "dance" somewhere near their name, and
 * none of them belong on the site.
 *
 * The census finds places by a name search, so the filter runs on the name.
 * A business is in scope when it names a partner dance, or when it says
 * "dance" and does not say something that rules it out.
 */

/** The dances, and the words studios use for them. */
const PARTNER_DANCE = new RegExp(
  [
    'salsa', 'bachata', 'zouk', 'kizomba', 'milonga', 'practica', 'tango',
    'shag', 'cumbia', 'rumba', 'mambo', 'cha\\s?cha', 'jive', 'foxtrot',
    'ballroom', 'balboa', 'hustle', 'merengue', 'kambo', 'paso\\s*doble',
    'viennese', 'waltz', 'samba', 'two\\s*step', 'polka', 'contra',
    'ecstatic', 'rhythm', 'belly\\s*danc', 'wcs', 'west\\s*coast\\s*swing',
    'country\\s*line', 'swing\\s*danc', 'latin\\s*danc', 'partner\\s*danc',
    'irish\\s*step', 'step\\s*danc', 'folk\\s*danc', 'afro\\s*cuban',
    'soca', 'bomba', 'plenero', 'plenero',
  ].join('|'),
  'i'
)

/** Things that rule a business out even when it says "dance". */
const NOT_PARTNER_DANCE = new RegExp(
  [
    'ballet', 'contemporary', 'jazz', 'tap\\s*class', 'acrobat', 'aerial',
    'pole', 'barre', 'pilates', 'yoga', 'hip\\s*hop', 'lyrical', 'pointe',
    'performing\\s*arts', 'fine\\s*arts', 'gelato', 'power\\s*systems',
    'residential', 'beer', 'burger', 'farmhouse', 'restaurant', 'bakery',
    'cafe', 'coffee', 'pizza', 'bowls?', 'kitchen', 'realty', 'church',
    'school\\s*of\\s*theology', 'college', 'university', 'preschool',
    'daycare', 'childcare',
  ].join('|'),
  'i'
)

/** The word "dance" on its own. */
const DANCE_WORD = /\b(?:dance|dancing|dancer|dancers|dance\s?(?:studio|school|academy|company|center|centre|hall|club|collective|arts|works|labs?|space|fitness|place|spot|room))\b/i

/**
 * True when the name belongs to a partner dance business.
 *
 * "Dancers Unlimited" is in scope. "SunDance Power Systems" is not - the
 * word dance is inside a longer one. "Raleigh School of Ballet" is not,
 * because ballet is not partner dance.
 */
export function isPartnerDanceBusiness(name: string | null | undefined): boolean {
  if (!name) return false
  const text = name.trim()
  if (!text) return false

  // A business that says "dance" and also says something that rules it out
  // is out, unless it names a partner dance directly.
  if (PARTNER_DANCE.test(text)) return true
  if (NOT_PARTNER_DANCE.test(text)) return false
  return DANCE_WORD.test(text)
}
