import { PrismaClient } from '../../node_modules/.prisma/client'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.candidateEvent.findMany({
    where: { qaStatus: 'PASS', reviewStatus: 'PENDING' },
    select: { id: true, title: true, city: true, state: true, localDate: true },
    orderBy: { localDate: 'asc' },
  })
  for (const c of candidates) {
    console.log(`${c.id.slice(0, 8)}  ${(c.city ?? '—')}, ${c.state ?? '—'}  ${c.localDate ?? '—'}  ${c.title.slice(0, 46)}`)
  }
  console.log(`\n${candidates.length} publishable candidate(s)`)
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
