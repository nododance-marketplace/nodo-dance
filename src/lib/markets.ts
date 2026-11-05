/**
 * The markets Nodo serves.
 *
 * A market is a city and the towns around it that people would actually
 * drive to for a dance. Charlotte includes Matthews and Cornelius because
 * that is how the dance community actually moves; listing them separately
 * would split one scene into three.
 *
 * This file is the single source of truth for which market an event belongs
 * to. The events API filters on it, the switcher is built from it, and the
 * city landing pages render from it.
 */

export interface Market {
  /** URL slug: /cities/austin */
  slug: string
  /** Short name: "Austin" */
  name: string
  /** Two-letter state: "TX" */
  state: string
  /** Display label: "Austin, TX" */
  label: string
  /** IANA timezone — the wall clock the market's events run on. */
  timeZone: string
  /** Map centre when this market is selected. */
  center: [number, number]
  /** Map zoom when this market is selected. */
  zoom: number
  /** The city names on an event that belong to this market. */
  cities: string[]
  /** One line for the landing page. */
  tagline: string
}

export const MARKETS: Market[] = [
  {
    slug: 'charlotte',
    name: 'Charlotte',
    state: 'NC',
    label: 'Charlotte, NC',
    timeZone: 'America/New_York',
    center: [35.2271, -80.8431],
    zoom: 11,
    cities: [
      'Charlotte', 'Matthews', 'Cornelius', 'Huntersville', 'Concord', 'Kannapolis',
      'Indian Trail', 'Monroe', 'Waxhaw', 'Pineville', 'Fort Mill', 'Rock Hill',
      'Davidson', 'Gastonia', 'Belmont', 'Cramerton', 'Lowell', 'Weddington',
      'Matthews',
    ],
    tagline: 'Where Nodo started — the biggest partner dance scene in the Carolinas.',
  },
  {
    slug: 'austin',
    name: 'Austin',
    state: 'TX',
    label: 'Austin, TX',
    timeZone: 'America/Chicago',
    center: [30.2672, -97.7431],
    zoom: 11,
    cities: [
      'Austin', 'Round Rock', 'Cedar Park', 'Pflugerville', 'Georgetown', 'Kyle',
      'Buda', 'Dripping Springs', 'San Marcos', 'Lakeway', 'Bee Cave', 'Manor',
      'Taylor', 'Hutto', 'Jonestown', 'Elgin', 'Bastrop',
    ],
    tagline: 'Live music capital, and the busiest partner dance calendar we cover.',
  },
  {
    slug: 'seattle',
    name: 'Seattle',
    state: 'WA',
    label: 'Seattle, WA',
    timeZone: 'America/Los_Angeles',
    center: [47.6062, -122.3321],
    zoom: 10,
    cities: [
      'Seattle', 'Bellevue', 'Everett', 'Renton', 'Kirkland', 'Tacoma', 'Shoreline',
      'Edmonds', 'Burien', 'Kent', 'Federal Way', 'Issaquah', 'Redmond', 'Bothell',
      'Lynnwood', 'Auburn', 'Tukwila', 'SeaTac', 'Sammamish', 'Mill Creek', 'Monroe',
      'Snohomish', 'Puyallup',
    ],
    tagline: 'West Coast Swing and Kizomba nights up and down the Sound.',
  },
  {
    slug: 'durham',
    name: 'Durham',
    state: 'NC',
    label: 'Durham, NC',
    timeZone: 'America/New_York',
    center: [35.994, -78.8986],
    zoom: 11,
    cities: ['Durham', 'Chapel Hill', 'Carrboro', 'Hillsborough', 'Pittsboro', 'Mebane'],
    tagline: 'The Research Triangle scene, including the Triangle’s busiest studios.',
  },
  {
    slug: 'philadelphia',
    name: 'Philadelphia',
    state: 'PA',
    label: 'Philadelphia, PA',
    timeZone: 'America/New_York',
    center: [39.9526, -75.1652],
    zoom: 10,
    cities: [
      'Philadelphia', 'King of Prussia', 'West Chester', 'Bryn Mawr', 'Conshohocken',
      'Media', 'Bala Cynwyd', 'Ardmore', 'Upper Darby', 'Cherry Hill', 'Camden',
      'Norristown', 'New Hope', 'Doylestown', 'Bensalem', 'Levittown', 'Princeton',
    ],
    tagline: 'Ballroom, salsa and swing, on both sides of the Delaware.',
  },
  {
    slug: 'portland',
    name: 'Portland',
    state: 'OR',
    label: 'Portland, OR',
    timeZone: 'America/Los_Angeles',
    center: [45.5152, -122.6784],
    zoom: 10,
    cities: [
      'Portland', 'Beaverton', 'Hillsboro', 'Gresham', 'Lake Oswego', 'Tigard',
      'Tualatin', 'Vancouver', 'Oregon City', 'Milwaukie', 'Sherwood', 'West Linn',
      'Happy Valley', 'Troutdale', 'Clackamas', 'Aloha', 'Forest Grove', 'Hillsboro',
    ],
    tagline: 'Tango, salsa and a strong local swing scene.',
  },
  {
    slug: 'atlanta',
    name: 'Atlanta',
    state: 'GA',
    label: 'Atlanta, GA',
    timeZone: 'America/New_York',
    center: [33.749, -84.388],
    zoom: 10,
    cities: [
      'Atlanta', 'Decatur', 'Marietta', 'Sandy Springs', 'Roswell', 'Alpharetta',
      'Smyrna', 'Kennesaw', 'Duluth', 'Johns Creek', 'Douglasville', 'Brookhaven',
      'Peachtree City', 'Woodstock', 'Chamblee', 'College Park', 'East Point',
      'Stockbridge', 'Lawrenceville', 'Powder Springs',
    ],
    tagline: 'A large, fast-growing scene spread across the metro.',
  },
  {
    slug: 'miami',
    name: 'Miami',
    state: 'FL',
    label: 'Miami, FL',
    timeZone: 'America/New_York',
    center: [25.7617, -80.1918],
    zoom: 10,
    cities: [
      'Miami', 'Coral Gables', 'Doral', 'Hialeah', 'Aventura', 'Homestead',
      'Fort Lauderdale', 'Pompano Beach', 'Kendall', 'Miami Beach', 'North Miami',
      'Pembroke Pines', 'Weston', 'Plantation', 'Sunrise', 'Miami Lakes', 'Davie',
      'Miramar', 'Sweetwater', 'Hialeah Gardens',
    ],
    tagline: 'Salsa and bachata on the clock, every week of the year.',
  },
  {
    slug: 'boston',
    name: 'Boston',
    state: 'MA',
    label: 'Boston, MA',
    timeZone: 'America/New_York',
    center: [42.3601, -71.0589],
    zoom: 11,
    cities: [
      'Boston', 'Cambridge', 'Somerville', 'Brookline', 'Quincy', 'Newton', 'Waltham',
      'Medford', 'Malden', 'Arlington', 'Watertown', 'Needham', 'Norwood', 'Woburn',
      'Everett', 'Jamaica Plain',
    ],
    tagline: 'Tango and salsa traditions in Cambridge and Somerville.',
  },
  {
    slug: 'los-angeles',
    name: 'Los Angeles',
    state: 'CA',
    label: 'Los Angeles, CA',
    timeZone: 'America/Los_Angeles',
    center: [34.0522, -118.2437],
    zoom: 10,
    cities: [
      'Los Angeles', 'Santa Monica', 'Pasadena', 'Burbank', 'Long Beach', 'Glendale',
      'Culver City', 'West Hollywood', 'Beverly Hills', 'Torrance', 'Inglewood',
      'South Pasadena', 'El Segundo', 'Santa Clarita', 'Marina del Rey', 'Venice',
      'Alhambra', 'Whittier', 'Huntington Park',
    ],
    tagline: 'The largest single population of dancers in the country.',
  },
  {
    slug: 'denver',
    name: 'Denver',
    state: 'CO',
    label: 'Denver, CO',
    timeZone: 'America/Chicago',
    center: [39.7392, -104.9903],
    zoom: 10,
    cities: [
      'Denver', 'Aurora', 'Boulder', 'Lakewood', 'Englewood', 'Littleton',
      'Wheat Ridge', 'Arvada', 'Westminster', 'Centennial', 'Highlands Ranch',
      'Thornton', 'Brighton', 'Broomfield', 'Parker', 'Castle Rock',
      'Commerce City', 'Northglenn', 'Greenwood Village',
    ],
    tagline: 'High altitude, high tempo — a big salsa and bachata calendar.',
  },
  {
    slug: 'nashville',
    name: 'Nashville',
    state: 'TN',
    label: 'Nashville, TN',
    timeZone: 'America/Chicago',
    center: [36.1627, -86.7816],
    zoom: 10,
    cities: [
      'Nashville', 'Franklin', 'Brentwood', 'Hendersonville', 'Murfreesboro',
      'Goodlettsville', 'Smyrna', 'Mount Juliet', 'Gallatin', 'Spring Hill',
      'Lebanon', 'Madison', 'La Vergne', 'Bellevue',
    ],
    tagline: 'Live music capital with a growing partner dance night.',
  },
  {
    slug: 'new-orleans',
    name: 'New Orleans',
    state: 'LA',
    label: 'New Orleans, LA',
    timeZone: 'America/New_York',
    center: [29.9511, -90.0715],
    zoom: 11,
    cities: [
      'New Orleans', 'Metairie', 'Kenner', 'Slidell', 'Chalmette', 'Gretna',
      'Westwego', 'Harvey', 'Belle Chasse', 'Marrero', 'Mandeville', 'Houma',
    ],
    tagline: 'Kizomba and zouk roots — the deepest Caribbean scene in the country.',
  },
  {
    slug: 'raleigh',
    name: 'Raleigh',
    state: 'NC',
    label: 'Raleigh, NC',
    timeZone: 'America/New_York',
    center: [35.7796, -78.6382],
    zoom: 10,
    cities: [
      'Raleigh', 'Cary', 'Wake Forest', 'Holly Springs', 'Garner', 'Apex',
      'Fuquay-Varina', 'Knightdale', 'Clayton', 'Morrisville', 'Wendell', 'Zebulon',
      'Rolesville', 'Knightdale',
    ],
    tagline: 'The other half of the Triangle, with its own studio scene.',
  },
  {
    slug: 'san-diego',
    name: 'San Diego',
    state: 'CA',
    label: 'San Diego, CA',
    timeZone: 'America/Los_Angeles',
    center: [32.7157, -117.1611],
    zoom: 10,
    cities: [
      'San Diego', 'Chula Vista', 'Escondido', 'Oceanside', 'Carlsbad', 'El Cajon',
      'Vista', 'San Marcos', 'Encinitas', 'National City', 'La Mesa', 'Santee',
      'Poway', 'Coronado', 'Imperial Beach', 'San Clemente',
    ],
    tagline: 'Border-town salsa nights and a steady kizomba calendar.',
  },
]

const BY_SLUG = new Map(MARKETS.map((m) => [m.slug, m]))

// A city can be listed twice by accident, and a duplicate would double every
// count that walks the list.
for (const market of MARKETS) {
  market.cities = [...new Set(market.cities)]
}

/** The market a city belongs to, or null when it is not one we serve. */
export function marketForCity(city: string | null | undefined, state?: string | null): Market | null {
  if (!city) return null
  const wanted = city.trim().toLowerCase()
  for (const market of MARKETS) {
    if (state && market.state !== state.toUpperCase()) continue
    if (market.cities.some((c) => c.toLowerCase() === wanted)) return market
  }
  return null
}

/** The market with this slug. */
export function marketBySlug(slug: string | null | undefined): Market | null {
  if (!slug) return null
  return BY_SLUG.get(slug.toLowerCase()) ?? null
}

/** Every city name that belongs to a market, lowercased, for a database filter. */
export function allMarketCities(): string[] {
  const set = new Set<string>()
  for (const market of MARKETS) {
    for (const city of market.cities) set.add(city.toLowerCase())
  }
  return [...set]
}

/**
 * The market that used to be the only one.
 *
 * NEXT_PUBLIC_CITY still names the home market, so the default copy and the
 * default map centre do not have to change.
 */
export function homeMarket(): Market {
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'
  const state = city.split(',').pop()?.trim()
  const match = MARKETS.find((m) => m.name.toLowerCase() === city.split(',')[0].trim().toLowerCase())
  return match ?? BY_SLUG.get('charlotte') ?? MARKETS[0]
}
