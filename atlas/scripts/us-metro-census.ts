import { writeFileSync } from 'node:fs'

/**
 * Metro-level dance presence census for the Nodo Atlas rollout, using
 * OpenStreetMap via Overpass (ODbL). Bounding-box queries — fast and
 * reliable compared with area lookups.
 *
 * OSM systematically undercounts small private studios that were never
 * mapped. These are floors, not ceilings.
 */

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const UA = 'NodoAtlas/1.0 (+https://nododance.com/atlas-bot; contact: nododance@gmail.com)'
const DANCE_NAME = '(dance|dancing|salsa|bachata|kizomba|zouk|milonga|tango|ballroom|shag|cumbia)'

const METROS: Array<[string, string, string]> = [
  ['Charlotte', 'North Carolina', '35.00,-80.95,35.35,-80.60'],
  ['Raleigh', 'North Carolina', '35.70,-78.80,35.92,-78.50'],
  ['Durham', 'North Carolina', '35.90,-79.05,36.05,-78.80'],
  ['Atlanta', 'Georgia', '33.60,-84.60,33.95,-84.20'],
  ['Austin', 'Texas', '30.15,-97.90,30.45,-97.55'],
  ['Miami', 'Florida', '25.65,-80.35,25.95,-80.05'],
  ['Chicago', 'Illinois', '41.75,-87.85,42.05,-87.55'],
  ['New York', 'New York', '40.55,-74.10,40.90,-73.70'],
  ['Los Angeles', 'California', '33.90,-118.35,34.15,-118.05'],
  ['Houston', 'Texas', '29.60,-95.55,29.90,-95.20'],
  ['Phoenix', 'Arizona', '33.30,-112.20,33.60,-111.90'],
  ['Philadelphia', 'Pennsylvania', '39.85,-75.40,40.10,-75.10'],
  ['Dallas', 'Texas', '32.65,-96.95,32.95,-96.60'],
  ['San Diego', 'California', '32.55,-117.20,32.80,-116.90'],
  ['Tampa', 'Florida', '27.85,-82.55,28.05,-82.30'],
  ['New Orleans', 'Louisiana', '29.90,-90.15,30.05,-89.90'],
  ['Denver', 'Colorado', '39.65,-105.10,39.85,-104.80'],
  ['Boston', 'Massachusetts', '42.30,-71.15,42.45,-70.95'],
  ['Seattle', 'Washington', '47.50,-122.45,47.70,-122.20'],
  ['Detroit', 'Michigan', '42.30,-83.15,42.45,-82.90'],
  ['Nashville', 'Tennessee', '36.10,-86.85,36.25,-86.60'],
  ['Las Vegas', 'Nevada', '36.05,-115.25,36.25,-115.00'],
  ['Portland', 'Oregon', '45.45,-122.75,45.60,-122.50'],
  ['Memphis', 'Tennessee', '35.05,-90.10,35.20,-89.85'],
  ['Baltimore', 'Maryland', '39.20,-76.70,39.40,-76.45'],
  ['Milwaukee', 'Wisconsin', '42.95,-88.05,43.15,-87.85'],
  ['Kansas City', 'Missouri', '39.05,-94.70,39.25,-94.45'],
  ['Cleveland', 'Ohio', '41.40,-81.80,41.60,-81.50'],
  ['Minneapolis', 'Minnesota', '44.90,-93.35,45.10,-93.15'],
  ['Newark', 'New Jersey', '40.70,-74.25,40.85,-74.05'],
  ['St. Louis', 'Missouri', '38.55,-90.35,38.75,-90.15'],
  ['Pittsburgh', 'Pennsylvania', '40.40,-80.05,40.55,-79.85'],
  ['Orlando', 'Florida', '28.40,-81.45,28.60,-81.25'],
  ['Cincinnati', 'Ohio', '39.05,-84.60,39.25,-84.35'],
  ['Indianapolis', 'Indiana', '39.70,-86.25,39.90,-86.00'],
  ['Columbus', 'Ohio', '39.90,-83.15,40.10,-82.90'],
  ['San Francisco', 'California', '37.70,-122.55,37.85,-122.35'],
  ['Jacksonville', 'Florida', '30.25,-81.75,30.45,-81.55'],
]

async function count(bbox: string, extra: string): Promise<number> {
  const query = `[out:json][timeout:90];nwr(${bbox})${extra};out count;`
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as any
  return Number(json.elements?.[0]?.tags?.total ?? 0)
}

async function main() {
  console.log('Metro dance presence — OpenStreetMap via Overpass (ODbL)\n')
  console.log('  City                    State             Venues  Named  Total')
  const results: any[] = []

  for (const [city, state, bbox] of METROS) {
    let v = 0
    let n = 0
    try {
      v = await count(bbox, '["leisure"="dance"]')
      await new Promise(r => setTimeout(r, 400))
      n = await count(bbox, `["name"~"${DANCE_NAME}",i]`)
    } catch (error) {
      console.error(`  ! ${city}: ${(error as Error).message}`)
    }
    results.push({ city, state, venues: v, named: n })
    console.log(
      `  ${city.padEnd(22)} ${state.padEnd(16)} ${String(v).padStart(6)} ${String(n).padStart(6)} ${String(v + n).padStart(6)}`
    )
    await new Promise(r => setTimeout(r, 400))
  }

  results.sort((a, b) => b.venues + b.named - (a.venues + a.named))
  const totals = results.reduce((a, r) => ({ v: a.v + r.venues, n: a.n + r.named }), { v: 0, n: 0 })
  console.log(`\n  ${results.length} metros measured: ${totals.v} dance venues, ${totals.n} named dance places`)

  writeFileSync('atlas/.cache/us-metro-census.json', JSON.stringify(results, null, 2))
  console.log('  Saved to atlas/.cache/us-metro-census.json')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
