/**
 * Prune the sources that are not partner dance businesses.
 *
 * The state census finds places by a name search, which catches anything
 * with a dance word near its name: a solar company called SunDance, a
 * sandwich shop, a ballet school. None of them belong on a partner dance
 * directory, and every one of them costs a crawl.
 *
 * A studio whose only presence is a Facebook page is a real studio - it is
 * exactly the long tail the submission flywheel is for - but there is
 * nothing to crawl, so it is paused with the reason recorded.
 *
 * Usage:
 *   npx tsx atlas/scripts/prune-junk-sources.ts            # report only
 *   npx tsx atlas/scripts/prune-junk-sources.ts --apply
 */
import { PrismaClient } from '../../node_modules/.prisma/client'
import { isPartnerDanceBusiness } from '../lib/partner-dance'

const p = new PrismaClient()

const SOCIAL_ONLY = ['facebook.com', 'm.facebook.com', 'instagram.com']

async function main() {
  const sources = await p.discoverySource.findMany({
    select: {
      id: true,
      domain: true,
      organizationName: true,
      url: true,
      city: { select: { name: true, state: true } },
      _count: { select: { candidates: true } },
    },
  })

  const socialOnly = sources.filter((s) => SOCIAL_ONLY.includes(s.domain))
  const notPartnerDance = sources.filter(
    (s) => !SOCIAL_ONLY.includes(s.domain) && !isPartnerDanceBusiness(s.organizationName)
  )
  const withCandidates = notPartnerDance.filter((s) => s._count.candidates > 0)

  console.log(`sources: ${sources.length}`)
  console.log(`  not a partner dance business: ${notPartnerDance.length}  (${withCandidates.length} had produced events)`)
  console.log(`  social only, nothing to crawl: ${socialOnly.length}\n`)

  for (const s of notPartnerDance) {
    console.log(
      `  ${s.domain.padEnd(32)} ${(s.organizationName ?? '').slice(0, 38).padEnd(38)} ${s.city?.name ?? '-'}  ${s._count.candidates} candidates`
    )
  }

  console.log('\nsocial only:')
  for (const s of socialOnly) {
    console.log(`  ${s.domain.padEnd(32)} ${(s.organizationName ?? '').slice(0, 38).padEnd(38)} ${s.city?.name ?? '-'}`)
  }

  if (process.argv.includes('--apply')) {
    const today = new Date().toISOString().slice(0, 10)

    for (const s of notPartnerDance) {
      await p.discoverySource.update({
        where: { id: s.id },
        data: {
          isPaused: true,
          notes: `Paused ${today}: not a partner dance business ("${s.organizationName ?? ''}").`,
        },
      })
    }
    for (const s of socialOnly) {
      await p.discoverySource.update({
        where: { id: s.id },
        data: {
          isPaused: true,
          notes: `Paused ${today}: this studio is only on ${s.domain}. We read the links on a studio's own website; we do not read a platform. Reach them through their city page.`,
        },
      })
    }
    console.log(`\npaused ${notPartnerDance.length + socialOnly.length} source(s)`)
  } else {
    console.log('\nNothing was written. Re-run with --apply to save.')
  }
  await p.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
