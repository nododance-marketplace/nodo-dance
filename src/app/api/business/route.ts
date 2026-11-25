import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateUniqueSlug } from '@/lib/slug'

/**
 * Create a Business (M1). The signed-in user becomes the owner and gets an
 * OWNER BusinessMember row so ownership checks are membership-based, not
 * a special case.
 */
const schema = z.object({
  name: z.string().min(2).max(100),
  kind: z.enum(['TEACHER', 'ACADEMY', 'ORGANIZER']),
  city: z.string().max(80).optional().or(z.literal('')),
  state: z.string().max(80).optional().or(z.literal('')),
  websiteUrl: z.string().regex(/^https?:\/\/\S+$/i).max(300).optional().or(z.literal('')),
})

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const body = await request.json()
    const data = schema.parse(body)

    // Look up user ID for ownerId (session carries id, but resolve from the
    // DB so we never store an id that isn't a real user)
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }

    // Rate limiting — 10 businesses per hour per user is generous for a human
    // and stops scripted spam
    const allowed = await checkRateLimit({
      identifier: user.id,
      action: 'create-business',
      limit: 10,
      window: 3600, // 1 hour
    })
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait about an hour and try again.' },
        { status: 429 }
      )
    }

    const slug = await generateUniqueSlug(data.name, async (candidate) => {
      const taken = await prisma.business.findUnique({ where: { slug: candidate } })
      return Boolean(taken)
    })

    const business = await prisma.business.create({
      data: {
        slug,
        name: data.name,
        kind: data.kind,
        ownerId: user.id,
        city: data.city || null,
        state: data.state || null,
        websiteUrl: data.websiteUrl || null,
        members: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
    })

    return NextResponse.json(
      { success: true, id: business.id, slug: business.slug, name: business.name },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating business:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    // Unique constraint on slug lost a race with a concurrent create
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Name collision, please try again' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
