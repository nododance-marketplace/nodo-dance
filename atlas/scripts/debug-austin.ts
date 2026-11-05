import { Fetcher } from '../lib/fetcher'
import { extractEvents } from '../lib/parsers/extract'
import { extractJsonLd, extractMeta } from '../lib/parsers/html'

async function main() {
  const url = process.argv[2] ?? 'https://austinecstaticdancecenter.com/'
  const fetcher = new Fetcher({ politenessDelayMs: 1500 })
  const res = await fetcher.fetch(url)
  console.log('status', res.status, 'bytes', res.bytes)

  const meta = extractMeta(res.body)
  console.log('og:desc =', JSON.stringify((meta['og:description'] ?? '').slice(0, 120)))

  const ld = extractJsonLd(res.body)
  console.log('json-ld nodes:', ld.length)
  for (const node of ld.slice(0, 3)) {
    console.log('  type:', node['@type'], '| desc:', JSON.stringify(String(node.description ?? '').slice(0, 100)))
  }

  const events = extractEvents(res.body, url, 'America/Chicago')
  console.log('\nextracted:', events.length)
  for (const e of events.slice(0, 3)) {
    console.log('  title:', e.title)
    console.log('  desc:', JSON.stringify((e.description ?? '').slice(0, 120)))
    console.log('  method:', e.extractionMethod)
  }
}

main()
