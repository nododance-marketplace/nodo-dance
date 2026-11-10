import { createPrisma } from '../lib/db'

async function main() {
  const prisma = createPrisma('local')
  const attempts = await prisma.crawlAttempt.findMany({
    where: { status: { not: 'SUCCESS' } },
    orderBy: { id: 'desc' },
    take: 40,
    select: {
      id: true,
      status: true,
      url: true,
      errorCode: true,
      errorMessage: true,
      httpStatus: true,
    },
  })
  for (const a of attempts) {
    console.log(
      a.status.padEnd(18),
      (a.httpStatus ?? '-').toString().padEnd(5),
      (a.errorCode ?? '').padEnd(20),
      (a.url ?? '').slice(0, 70).padEnd(72),
      (a.errorMessage ?? '').slice(0, 80)
    )
  }
  await prisma.$disconnect()
}
main()
