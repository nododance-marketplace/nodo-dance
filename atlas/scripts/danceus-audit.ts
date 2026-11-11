import { Pool, neonConfig } from '@neondatabase/serverless'
import WebSocket from 'ws'

const NEON_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!NEON_URL) {
  console.error('ERR: set DIRECT_URL (or DATABASE_URL) in the environment, e.g. node --env-file=.env')
  process.exit(1)
}

neonConfig.webSocketConstructor = WebSocket
const pool = new Pool({ connectionString: NEON_URL })

async function main() {
  const stats = await pool.query(`
    select
      (select count(*)::int from "Event") as events_total,
      (select count(*)::int from "Event" where status = 'APPROVED') as events_approved,
      (select count(*)::int from "Event" where "startDateTime" >= now()) as events_upcoming,
      (select count(*)::int from "Event" where "publishedVia" = 'ATLAS') as events_via_atlas,
      (select count(*)::int from "DiscoverySource" where "isPaused" = false) as sources_active,
      (select count(*)::int from "DiscoveryCity") as cities`)
  console.log(JSON.stringify(stats.rows[0], null, 2))

  const spread = await pool.query(`
    select date_trunc('month', "startDateTime") as month, count(*)::int as n
    from "Event" where status = 'APPROVED' and "startDateTime" >= now()
    group by 1 order by 1`)
  console.log('\nupcoming events by month:')
  for (const r of spread.rows) console.log(`  ${r.month.toISOString().slice(0, 7)}  ${r.n}`)

  const sample = await pool.query(`
    select title, "startDateTime"::date as d, "venueName" from "Event"
    where status = 'APPROVED' and "startDateTime" >= now()
    order by random() limit 5`)
  console.log('\nrandom upcoming sample:')
  for (const r of sample.rows) console.log(`  ${r.d}  ${(r.title ?? '').slice(0, 50)}  @ ${r.venueName}`)
  await pool.end()
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
