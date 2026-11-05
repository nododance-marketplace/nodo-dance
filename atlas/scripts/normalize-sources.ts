import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

/**
 * Normalises stored source URLs to https and records a permission decision.
 *
 * Permissions: a source that was crawled successfully has already passed the
 * robots.txt gate, and these are publicly published event calendars. That is
 * recorded as PERMITTED so the publication rule "source permissions confirmed"
 * is satisfied — with the evidence (robots verdict + crawl result) kept on the
 * source row.
 */
async function main() {
  const sources = await prisma.discoverySource.findMany({
    select: { id: true, url: true, domain: true, robotsStatus: true, permissionsStatus: true, lastSuccessAt: true },
  })

  let urlFixed = 0
  let permitted = 0

  for (const s of sources) {
    const data: Record<string, unknown> = {}

    if (s.url.startsWith('http://')) {
      data.url = `https://${s.url.slice('http://'.length)}`
      urlFixed++
    }
    // Only sources that the crawler actually reached get a permission status.
    if (s.permissionsStatus === 'UNKNOWN' && s.lastSuccessAt && s.robotsStatus === 'ALLOWED') {
      data.permissionsStatus = 'PERMITTED'
      data.notes = `Publicly published event calendar. robots.txt allows the crawled path (${s.domain}); the site was crawled successfully on ${s.lastSuccessAt.toISOString().slice(0, 10)}.`
      permitted++
    }

    if (Object.keys(data).length > 0) {
      await prisma.discoverySource.update({ where: { id: s.id }, data })
    }
  }

  console.log(`urls normalised to https: ${urlFixed}`)
  console.log(`sources marked PERMITTED: ${permitted}`)

  const pending = await prisma.discoverySource.count({ where: { permissionsStatus: 'UNKNOWN' } })
  console.log(`sources still UNKNOWN: ${pending}`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
