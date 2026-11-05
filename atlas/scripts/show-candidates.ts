import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.candidateEvent.findMany({
    where: { qaStatus: 'PASS' },
    include: { source: { select: { url: true, domain: true, organizationName: true, permissionsStatus: true } } },
    orderBy: { confidence: 'desc' },
    take: 14,
  })

  for (const c of candidates) {
    console.log('─'.repeat(72))
    console.log(`title      ${c.title}`)
    console.log(`date/time  ${c.localDate ?? '—'}  ${c.localTime ?? '—'}  tz=${c.timeZone ?? '—'}  recurring=${c.isRecurring}`)
    console.log(`venue      ${c.venueName ?? '—'}`)
    console.log(`address    ${c.address ?? '—'}`)
    console.log(`city/state ${c.city ?? '—'}, ${c.state ?? '—'} ${c.zip ?? ''}   lat=${c.lat ?? '—'} lng=${c.lng ?? '—'}`)
    console.log(`type/style ${c.eventType ?? '—'}  ${c.styles}   price=${c.price ?? '—'} ${c.priceText ?? ''}`)
    console.log(`organizer  ${c.organizerName ?? '—'}`)
    console.log(`source     ${c.source.organizationName ?? '—'} <${c.source.url}>  perms=${c.source.permissionsStatus}`)
    console.log(`url        ${c.sourceUrl}`)
    if (c.recurrenceText) console.log(`recurrence ${c.recurrenceText}`)
    const desc = (c.description ?? '').slice(0, 110)
    if (desc) console.log(`desc       ${desc}…`)
  }

  console.log('─'.repeat(72))
  const total = await prisma.candidateEvent.count({ where: { qaStatus: 'PASS' } })
  console.log(`total PASS candidates in production: ${total}`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
