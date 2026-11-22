/** One-off: does the accented Eventbrite URL (fetched directly) SSR events for our bot UA? */
import { Fetcher } from '../lib/fetcher'

async function main() {
  const f = new Fetcher({ politenessDelayMs: 500 })
  const urls = [
    'https://www.eventbrite.com/d/brazil--s%C3%A3o-paulo/salsa/',
    'https://www.eventbrite.com/d/mexico--mexico-city/salsa/',
    'https://www.eventbrite.com/d/argentina--buenos-aires/tango/',
  ]
  for (const url of urls) {
    const r = await f.fetch(url)
    const links = [...r.body.matchAll(/eventbrite\.com\/e\//g)].length
    const title = /<title[^>]*>([^<]*)<\/title>/.exec(r.body)?.[1]?.trim()
    console.log(`${decodeURIComponent(url.slice(30, 60)).padEnd(24)} status ${r.status} bytes ${r.body.length} eventLinks ${links} title "${title}"`)
  }
}

main().catch(e => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
