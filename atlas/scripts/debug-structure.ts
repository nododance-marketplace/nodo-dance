import { Fetcher } from '../lib/fetcher'
import { extractLinks } from '../lib/parsers/html'

async function main() {
  const url = process.argv[2] ?? 'https://www.tangoclt.com/practica'
  const fetcher = new Fetcher({ politenessDelayMs: 1000 })
  const res = await fetcher.fetch(url)
  const html = res.body

  // Show the markup around the first "View Event" link
  const idx = html.indexOf('View Event')
  if (idx !== -1) {
    console.log('--- around first "View Event" ---')
    console.log(html.slice(Math.max(0, idx - 900), idx + 500).replace(/\s+/g, ' '))
  }

  console.log('\n--- elements with event-ish classes ---')
  const classRe = /<([a-z0-9]+)([^>]*class="([^"]*(?:event|title|calendar)[^"]*)")[^>]*>/gi
  let m: RegExpExecArray | null
  const seen = new Set<string>()
  while ((m = classRe.exec(html)) && seen.size < 25) {
    const cls = m[3]
    if (seen.has(cls)) continue
    seen.add(cls)
    console.log(`<${m[1]} class="${cls}">`)
  }
}

main()
