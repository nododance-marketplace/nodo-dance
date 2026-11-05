import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Admin gate — mirrors the pattern used by /api/admin/events. */
export async function requireAtlasAdmin(): Promise<{ ok: boolean; email?: string }> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isAdmin(session.user.email)) return { ok: false }
  return { ok: true, email: session.user.email }
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function unauthorized() {
  return json({ error: 'Unauthorized' }, { status: 401 })
}

export async function handle(req: NextRequest) {
  const auth = await requireAtlasAdmin()
  if (!auth.ok) return unauthorized()
  return null
}

export { prisma }
