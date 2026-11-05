import { Fetcher } from '../lib/fetcher'
import { extractMeta, stripHtml } from '../lib/parsers/html'
import { extractEvents } from '../lib/parsers/extract'

async function main() {
  const url = process.argv[2] ?? 'https://www.tangoclt.com/practica'
  const fetcher = new Fetcher({ politenessDelayMs: 1000 })
  const res = await fetcher.fetch(url)
  console.log('status', res.status, 'bytes', res.bytes, 'type', res.contentType)
  const meta = extractMeta(res.body)
  console.log('og:title   =', JSON.stringify(meta['og:title']))
  console.log('title      =', JSON.stringify(meta['title']))
  console.log('og:desc    =', JSON.stringify((meta['og:description'] ?? '').slice(0, 120)))
  const { text } = stripHtml(res.body)
  console.log('text head  =', JSON.stringify(text.slice(0, 300)))
  const events = extractEvents(res.body, url, 'America/New_York')
  console.log('events     =', events.length)
  for (const e of events) {
    console.log('  -', JSON.stringify({ t: e.title, d: e.localDate, tm: e.localTime, m: e.extractionMethod, rec: e.isRecurring }))
  }
}

main()
