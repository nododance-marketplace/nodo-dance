import { PrismaClient } from '../generated/local-client'

const prisma = new PrismaClient()

async function main() {
  const matches = await prisma.entityMatch.groupBy({
    by: ['matchType'],
    _count: { _all: true },
  })
  console.log('match types:', matches.map(m => `${m.matchType}=${m._count._all}`).join(' '))

  const deterministic = await prisma.entityMatch.count({ where: { matchType: { in: ['EXACT', 'NORMALIZED', 'VENUE_TIME'] } } })
  const total = await prisma.entityMatch.count()
  console.log(`deterministic duplicates: ${deterministic} / ${total} proposals`)

  const rules = await prisma.recurrenceRule.count()
  const recurring = await prisma.candidateEvent.count({ where: { isRecurring: true } })
  console.log(`recurrence rules: ${rules}, recurring candidates: ${recurring}`)

  const attempts = await prisma.crawlAttempt.groupBy({ by: ['status'], _count: { _all: true } })
  console.log('attempts:', attempts.map(a => `${a.status}=${a._count._all}`).join(' '))

  const cost = await prisma.crawlAttempt.aggregate({ _sum: { costUsd: true }, _avg: { costUsd: true } })
  console.log(`total extraction cost: $${(cost._sum.costUsd ?? 0).toFixed(4)}`)
}

main().finally(() => prisma.$disconnect())
