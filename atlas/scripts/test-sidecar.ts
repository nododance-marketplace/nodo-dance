/**
 * Contract test for the LLM sidecar.
 *
 * The sidecar itself needs Python 3.12+ and an LLM key, neither of which is
 * available in every environment. What MUST be testable everywhere is the
 * worker's side of the contract: that a well-formed response becomes a
 * candidate, and that failures produce no candidate at all.
 *
 * This spins up a mock sidecar and exercises both paths.
 */
import { createServer } from 'node:http'
import { LlmExtractor } from '../lib/llm'
import { looksLikeEventListing } from '../lib/llm-gate'

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`)
  }
}

async function main() {
  console.log('\nLLM sidecar contract')

  // ── A mock sidecar ────────────────────────────────────────────────────────
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      if (req.url === '/extract') {
        const request = JSON.parse(body || '{}')
        if (request.url?.includes('fail')) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'extraction exploded' }))
          return
        }
        if (request.url?.includes('empty')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true, data: {} }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            ok: true,
            method: 'llm',
            costUsd: 0.00087,
            durationMs: 1200,
            data: {
              title: 'Salsa Social',
              eventType: 'SOCIAL',
              styles: ['Salsa'],
              startDate: '2027-03-05',
              startTime: '19:00',
              venueName: 'The Loft',
              address: '123 Main St',
              city: 'Charlotte',
              state: 'NC',
              organizerName: 'Charlotte Salsa Co',
              price: 15,
              description: 'Weekly salsa social.',
              isRecurring: true,
              recurrenceText: 'Every Friday',
            },
          })
        )
        return
      }
      res.writeHead(404)
      res.end()
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const baseUrl = `http://127.0.0.1:${port}`

  // ── Success path ──────────────────────────────────────────────────────────
  const extractor = new LlmExtractor({ sidecarUrl: baseUrl, secret: 'test-secret' })
  check('extractor reports enabled when a sidecar url is set', extractor.enabled)

  const ok = await extractor.extract('https://example.com/calendar', 'America/New_York')
  check('successful extraction returns ok', ok.ok, ok)
  check('cost is reported back', ok.costUsd === 0.00087, ok.costUsd)

  const candidate = extractor.toCandidate(ok, 'https://example.com/calendar', 'America/New_York')
  check('candidate is produced', candidate !== null)
  check('candidate title', candidate?.title === 'Salsa Social', candidate?.title)
  check('candidate local date', candidate?.localDate === '2027-03-05', candidate?.localDate)
  check('candidate local time', candidate?.localTime === '19:00', candidate?.localTime)
  check('candidate venue', candidate?.venueName === 'The Loft', candidate?.venueName)
  check('candidate method is LLM', candidate?.extractionMethod === 'LLM', candidate?.extractionMethod)
  check('candidate is recurring', candidate?.isRecurring === true)
  check('found fields include the extracted ones', (candidate?.foundFields ?? []).includes('venueName'))

  // ── Failure paths ─────────────────────────────────────────────────────────
  const failedResult = await extractor.extract('https://example.com/fail', 'America/New_York')
  check('sidecar error is not ok', failedResult.ok === false)
  check('no candidate from a failed extraction', extractor.toCandidate(failedResult, 'x', 'America/New_York') === null)

  const empty = await extractor.extract('https://example.com/empty', 'America/New_York')
  check('empty payload produces no candidate', extractor.toCandidate(empty, 'x', 'America/New_York') === null)

  // ── Sidecar not configured ────────────────────────────────────────────────
  const disabled = new LlmExtractor({ sidecarUrl: undefined })
  check('extractor reports disabled without a url', !disabled.enabled)
  const disabledResult = await disabled.extract('https://example.com', 'America/New_York')
  check('disabled extractor returns not ok', disabledResult.ok === false)
  check('disabled extractor explains why', (disabledResult.error ?? '').includes('not configured'))

  // ── Unreachable sidecar ───────────────────────────────────────────────────
  const unreachable = new LlmExtractor({ sidecarUrl: 'http://127.0.0.1:1', timeoutMs: 2000 })
  const unreachableResult = await unreachable.extract('https://example.com', 'America/New_York')
  check('unreachable sidecar returns not ok', unreachableResult.ok === false)
  check('unreachable sidecar produces no candidate', unreachable.toCandidate(unreachableResult, 'x', 'y') === null)

  // ── The gate that decides whether to spend money ─────────────────────────
  console.log('\nLLM gate')
  const eventPage = `<html><body><h1>Upcoming Salsa Classes</h1>
    <p>Join our weekly salsa social every Friday at The Loft.</p>
    <a href="/schedule">Schedule</a></body></html>`
  const schoolTimetable = `<html><body><h1>School Timetable</h1>
    <p>Class registration opens Monday. Term dates and bus schedules.</p></body></html>`

  check('a dance event listing qualifies', looksLikeEventListing(eventPage, 'https://example.com/events'))
  check('a school timetable does not qualify', !looksLikeEventListing(schoolTimetable, 'https://example.com/timetable'))
  check('a dance class URL qualifies', looksLikeEventListing(eventPage, 'https://example.com/classes'))
  check('a non-dance page does not qualify', !looksLikeEventListing('<html><body>About us</body></html>', 'https://example.com/about'))

  server.close()

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${passed} passed, ${failed} failed`)
  console.log(`${'─'.repeat(60)}\n`)
  process.exitCode = failed > 0 ? 1 : 0
}

main()
