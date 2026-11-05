/**
 * Record where each studio posts its events.
 *
 * We read the links a studio puts on its own website and store the ones
 * that are social accounts. We do not log in, we do not read the platform,
 * and we do not scrape anyone's posts.
 *
 * This matters for the long tail. Most small-town studios have an
 * Instagram account and no website at all, so this is how we know where to
 * look - and how a listing keeps the credit for where it came from.
 *
 * Usage:
 *   npx tsx atlas/scripts/capture-social-links.ts                # report only
 *   npx tsx atlas/scripts/capture-social-links.ts --apply
 */
import { createPrisma, type AtlasPrisma, type AtlasTarget } from '../lib/db'
import { Fetcher } from '../lib/fetcher'
import { RobotsCache } from '../lib/robots'
import { findSocialLinks, socialLinksToJson } from '../lib/social'

const prisma: AtlasPrisma = createPrisma(
  (process.argv.includes('--target=production') ? 'production' : 'local') as AtlasTarget
)
const APPLY = process.argv.includes('--apply')

async function main() {
  const fetcher = new Fetcher({ politenessDelayMs: 2000, requestTimeoutMs: 30000 })
  const robots = new RobotsCache()

  const sources = await prisma.discoverySource.findMany({
    where: { isPaused: false },
    select: { id: true, url: true, domain: true, organizationName: true, socialLinks: true },
    orderBy: { domain: 'asc' },
  })

  console.log(`reading social links from ${sources.length} source site(s)\n`)

  let found = 0
  let updated = 0
  let skipped = 0

  for (const source of sources) {
    // Only the home page. The accounts are in the header and footer.
    let home = source.url
    try {
      home = new URL(source.url).origin + '/'
    } catch {
      continue
    }

    const decision = await robots.decide(
      (await robots.load(new URL(home).origin, 'NodoAtlasBot/1.0', (url) => fetcher.fetch(url))),
      home,
      'NodoAtlasBot/1.0'
    )
    if (!decision.allowed) {
      skipped++
      continue
    }

    try {
      const res = await fetcher.fetch(home)
      if (res.status !== 200) {
        skipped++
        continue
      }
      const links = findSocialLinks(res.body)
      if (links.length === 0) {
        skipped++
        continue
      }
      found++
      const json = socialLinksToJson(links)
      const platforms = links.map((l) => l.platform).join(', ')
      console.log(`  ${source.domain.padEnd(34)} ${platforms}`)
      if (APPLY && json !== source.socialLinks) {
        await prisma.discoverySource.update({
          where: { id: source.id },
          data: { socialLinks: json },
        })
        updated++
      }
    } catch {
      skipped++
    }
  }

  console.log(`\n${found} site(s) link to a social account · ${updated} updated · ${skipped} skipped`)
  if (!APPLY) console.log('Nothing was written. Re-run with --apply to save.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.log('ERR', e.message)
  process.exit(1)
})
