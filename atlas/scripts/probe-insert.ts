import { PrismaClient } from '../../node_modules/.prisma/client'

/**
 * Proves the production insert path works with the new Atlas columns.
 *
 * The insert happens inside a transaction that is deliberately rolled back, so
 * nothing is persisted. If the column set were wrong the insert would fail
 * before the rollback — which is exactly what we want to detect.
 */
const prisma = new PrismaClient()

async function main() {
  try {
    await prisma.$transaction(async tx => {
      const created = await tx.event.create({
        data: {
          title: 'ATLAS_SCHEMA_PROBE — rolled back immediately',
          eventType: 'SOCIAL',
          styles: JSON.stringify(['Salsa']),
          startDateTime: new Date('2027-01-01T18:00:00Z'),
          venueName: 'Schema Probe',
          address: '1 Probe Way, Charlotte, NC 28202',
          city: 'Charlotte',
          state: 'NC',
          zip: '28202',
          timeZone: 'America/New_York',
          publishedVia: 'ATLAS',
          organizerName: 'Schema Probe',
          organizerEmail: 'probe@nododance.invalid',
          description: 'Transaction is rolled back; this row never persists.',
          status: 'PENDING',
        },
      })
      console.log('insert with new columns: OK (id', created.id, ')')
      throw new Error('ROLLBACK_PROBE')
    })
  } catch (error) {
    const message = (error as Error).message
    if (message === 'ROLLBACK_PROBE') {
      console.log('transaction rolled back as designed — nothing persisted')
    } else {
      console.log('INSERT FAILED:', message.split('\n')[0])
      process.exitCode = 1
    }
  }

  const after = await prisma.event.count()
  console.log('event count after probe:', after, '(expected 601)')
}

main().catch(e => console.log('ERR', e.message)).finally(() => prisma.$disconnect())
