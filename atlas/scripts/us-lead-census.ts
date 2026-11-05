import { writeFileSync } from 'node:fs'

/**
 * National lead census for Nodo Atlas, using OpenStreetMap (ODbL).
 *
 * OSM is a community dataset: it systematically UNDERCOUNTS small private
 * studios that were never mapped. These numbers are a floor, not a ceiling.
 */

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const UA = 'NodoAtlas/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com)'

const DANCE_NAME = '(dance|dancing|salsa|bachata|kizomba|zouk|milonga|tango|ballroom|shag|cumbia)'

async function overpass(query: string): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  const json = (await res.json()) as any
  return Number(json.elements?.[0]?.tags?.total ?? 0)
}

async function safe(label: string, query: string): Promise<number> {
  try {
    const n = await overpass(query)
    console.log(`  ${label.padEnd(46)} ${n}`)
    return n
  } catch (error) {
    console.log(`  ${label.padEnd(46)} ERROR (${(error as Error).message})`)
    return -1
  }
}

async function main() {
  console.log('Querying OpenStreetMap via Overpass (ODbL)…\n')
  const US = 'area["ISO3166-1"="US"][admin_level=2]->.us;'

  console.log('=== NATIONWIDE (United States) ===')
  const venues = await safe('Venues tagged leisure=dance', `[out:json][timeout:240];${US}nwr(area.us)["leisure"="dance"];out count;`)
  const social = await safe('Community centres tagged social_facility=dance', `[out:json][timeout:240];${US}nwr(area.us)["social_facility"="dance"];out count;`)
  const amenity = await safe('Amenity tagged amenity=dance', `[out:json][timeout:240];${US}nwr(area.us)["amenity"="dance"];out count;`)
  const named = await safe('Any named place with a dance word', `[out:json][timeout:300];${US}nwr(area.us)["name"~"${DANCE_NAME}",i];out count;`)
  const schools = await safe('Named dance schools / studios / academies', `[out:json][timeout:300];${US}nwr(area.us)["name"~"${DANCE_NAME}",i]["craft";"shop";"education";"amenity";"leisure";"club";"office";"sport";"social_facility";"community_centre"];out count;`)

  const metros: Array<[string, string]> = [
    ['New York', 'New York'], ['Los Angeles', 'California'], ['Chicago', 'Illinois'],
    ['Houston', 'Texas'], ['Phoenix', 'Arizona'], ['Philadelphia', 'Pennsylvania'],
    ['San Antonio', 'Texas'], ['San Diego', 'California'], ['Dallas', 'Texas'],
    ['Austin', 'Texas'], ['Jacksonville', 'Florida'], ['Columbus', 'Ohio'],
    ['Charlotte', 'North Carolina'], ['Indianapolis', 'Indiana'], ['San Francisco', 'California'],
    ['Seattle', 'Washington'], ['Denver', 'Colorado'], ['Boston', 'Massachusetts'],
    ['Miami', 'Florida'], ['Atlanta', 'Georgia'], ['Nashville', 'Tennessee'],
    ['Detroit', 'Michigan'], ['Portland', 'Oregon'], ['Las Vegas', 'Nevada'],
    ['Memphis', 'Tennessee'], ['Louisville', 'Kentucky'], ['Baltimore', 'Maryland'],
    ['Milwaukee', 'Wisconsin'], ['Albuquerque', 'New Mexico'], ['Tucson', 'Arizona'],
    ['Fresno', 'California'], ['Sacramento', 'California'], ['Kansas City', 'Missouri'],
    ['Omaha', 'Nebraska'], ['Raleigh', 'North Carolina'], ['Durham', 'North Carolina'],
    ['Cleveland', 'Ohio'], ['Tulsa', 'Oklahoma'], ['Oakland', 'California'],
    ['Minneapolis', 'Minnesota'], ['Wichita', 'Kansas'], ['New Orleans', 'Louisiana'],
    ['Tampa', 'Florida'], ['Honolulu', 'Hawaii'], ['Pittsburgh', 'Pennsylvania'],
    ['Cincinnati', 'Ohio'], ['St. Louis', 'Missouri'], ['Orlando', 'Florida'],
  ]

  console.log('\n=== TOP METROS BY MAPPED DANCE PRESENCE ===\n')
  console.log('  City                    State             Venues  Named   Total')
  const results: any[] = []

  for (const [city, state] of metros) {
    const area = `{{geocodeArea:${city}, ${state}, USA}}->.a;`
    const v = await safe(`  ${city}, ${state} venues`, `[out:json][timeout:90];${area}nwr(area.a)["leisure"="dance"];out count;`)
    const n = await safe(`  ${city}, ${state} named`, `[out:json][timeout:90];${area}nwr(area.a)["name"~"${DANCE_NAME}",i];out count;`)
    if (v >= 0 || n >= 0) results.push({ city, state, venues: Math.max(0, v), named: Math.max(0, n) })
    await new Promise(r => setTimeout(r, 800))
  }

  results.sort((a, b) => b.venues + b.named - (a.venues + a.named))
  console.log('\n=== RANKED ===\n')
  for (const r of results.slice(0, 25)) {
    console.log(
      `  ${r.city.padEnd(22)} ${r.state.padEnd(16)} ${String(r.venues).padStart(6)} ${String(r.named).padStart(6)} ${String(r.venues + r.named).padStart(7)}`
    )
  }

  const totals = results.reduce((a, r) => ({ v: a.v + r.venues, n: a.n + r.named }), { v: 0, n: 0 })
  console.log(`\n  ${results.length} metros measured: ${totals.v} venues, ${totals.n} named dance places`)

  writeFileSync(
    'atlas/.cache/us-dance-census.json',
    JSON.stringify({ venues, social, amenity, named, schools, results }, null, 2)
  )
  console.log('\nSaved to atlas/.cache/us-dance-census.json')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
