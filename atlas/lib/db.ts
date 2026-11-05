/**
 * Database targets for the Atlas worker.
 *
 * Two clients, one model set:
 *   - local      : SQLite file (atlas/prisma/atlas.db) — the proof of concept
 *   - production : Neon Postgres — the live marketplace
 *
 * The worker only ever WRITES candidates, sources and job records. It never
 * publishes an event. Publication is a human decision made in /admin/atlas.
 * That separation is what makes it safe to point the worker at production.
 */
import { PrismaClient as LocalClient } from '../generated/local-client'
import { PrismaClient as ProdClient } from '../../node_modules/.prisma/client'

export type AtlasTarget = 'local' | 'production'

/**
 * The local client is the structural base type; the production client has the
 * same models plus a few extra columns, so it is cast onto it.
 */
export type AtlasPrisma = LocalClient

export function createPrisma(target: AtlasTarget): AtlasPrisma {
  if (target === 'production') {
    return new ProdClient() as unknown as AtlasPrisma
  }
  return new LocalClient()
}

/**
 * Guard for the operations that touch the live marketplace.
 *
 * Discovery and crawling are safe against production because they only create
 * inert candidate records. Publishing is not — it changes what the public sees
 * — so it requires an explicit acknowledgement flag.
 */
export function assertPublishAllowed(target: AtlasTarget, acknowledged: boolean): void {
  if (target === 'production' && !acknowledged) {
    throw new Error(
      'Publishing to production requires --publish-to-production to confirm. ' +
      'Crawling and discovery are safe without it — they only create candidates.'
    )
  }
}
