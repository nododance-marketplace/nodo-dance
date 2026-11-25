import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { DANCE_STYLES } from '@/lib/constants'
import { generateUniqueSlug } from '@/lib/slug'
import { parseAsLocal, addDaysToDateString, isValidTimeZone } from '@/lib/timezone'

/**
 * Create a native Offering (class or event) under a business the signed-in
 * user owns or teaches for. Every occurrence — including an event's single
 * date — becomes a ClassSession row, so capacity and booking logic stay
 * uniform across types.
 */
const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
const localDateTimeRegex = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/
const urlishRegex = /^https?:\/\/\S+$/i

const KNOWN_STYLES: readonly string[] = DANCE_STYLES

const baseSchema = z.object({
  businessId: z.string().min(1),
  title: z.string().min(1).max(120),
  styles: z
    .array(z.string().min(1))
    .min(1)
    .max(6)
    .refine((styles) => styles.every((s) => KNOWN_STYLES.includes(s)), {
      message: `styles must be from: ${KNOWN_STYLES.join(', ')}`,
    }),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All levels']).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  venueName: z.string().min(1).max(120),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  state: z.string().max(80).optional().nullable(),
  price: z.number().nonnegative().max(10000).nullable().optional(), // null = free
  capacity: z.number().int().min(1).max(1000),
  partnerRequired: z.boolean().default(false),
  timeZone: z.string().default('America/New_York'),
})

// Local wall-clock strings, interpreted in the offering's timeZone — the
// server converts them to UTC so DST is decided server-side, not by the client
const classSchema = baseSchema.extend({
  type: z.literal('CLASS'),
  startDate: z.string().regex(dateRegex, 'YYYY-MM-DD'), // first occurrence date
  dayOfWeek: z.number().int().min(0).max(6), // 0=Sun..6=Sat, must match startDate
  localStartTime: z.string().regex(timeRegex, 'HH:MM'),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  isRecurring: z.boolean().default(false),
  weeks: z.number().int().min(1).max(26).default(8),
})

const tierSchema = z.object({
  name: z.string().min(1).max(60),
  price: z.number().positive().max(10000),
  inventory: z.number().int().min(1).max(1000),
})

const eventSchema = baseSchema.extend({
  type: z.literal('EVENT'),
  startDateTime: z.string().regex(localDateTimeRegex, 'YYYY-MM-DDTHH:MM'),
  endDateTime: z.string().regex(localDateTimeRegex, 'YYYY-MM-DDTHH:MM'),
  djCredits: z.string().max(200).optional().nullable(),
  coverImageUrl: z.string().regex(urlishRegex).max(500).optional().nullable(),
  // Paid ticket tiers (M2): present → the event sells tickets per tier and
  // isTicketed flips on. Absent → M1 behavior (free RSVP or single-price).
  tiers: z.array(tierSchema).max(10).optional(),
})

const schema = z.discriminatedUnion('type', [classSchema, eventSchema])

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const body = await request.json()
    const data = schema.parse(body)

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }

    // Business must exist, and the user must own or teach for it. Business-
    // scoped access is enforced here, never by hiding UI (spec rule 3).
    const membership = await prisma.businessMember.findUnique({
      where: {
        businessId_userId: { businessId: data.businessId, userId: user.id },
      },
    })
    if (!membership) {
      const businessExists = await prisma.business.findUnique({
        where: { id: data.businessId },
        select: { id: true },
      })
      return NextResponse.json(
        { error: businessExists ? 'Not a member of this business' : 'Business not found' },
        { status: businessExists ? 403 : 404 }
      )
    }
    if (membership.role !== 'OWNER' && membership.role !== 'INSTRUCTOR') {
      return NextResponse.json(
        { error: 'Only owners and instructors can create offerings' },
        { status: 403 }
      )
    }

    if (!isValidTimeZone(data.timeZone)) {
      return NextResponse.json(
        { error: 'Invalid IANA timeZone' },
        { status: 400 }
      )
    }

    // Build the occurrence rows: a recurring class gets one per week, a
    // one-off class gets one, an event gets exactly one
    let sessions: { startDateTime: Date; endDateTime: Date; status: string }[]
    let isRecurring = false
    let recurrenceGroupId: string | null = null
    let recurrenceRule: string | null = null

    if (data.type === 'CLASS') {
      // The schedule must agree with itself: dayOfWeek describes startDate
      const startDay = new Date(`${data.startDate}T12:00:00Z`).getUTCDay()
      if (startDay !== data.dayOfWeek) {
        return NextResponse.json(
          { error: `dayOfWeek ${data.dayOfWeek} does not match startDate (a ${startDay})` },
          { status: 400 }
        )
      }

      const weeks = data.isRecurring ? data.weeks : 1
      isRecurring = data.isRecurring
      if (isRecurring) {
        recurrenceGroupId = crypto.randomUUID()
        recurrenceRule = JSON.stringify({ byDay: [data.dayOfWeek], interval: 1, weeks })
      }

      // Each week is computed as calendar-date + 7 days, then the local wall
      // time is re-resolved for that date — this is what keeps the series on
      // the same local time across DST changes
      sessions = Array.from({ length: weeks }, (_, i) => {
        const localDate = addDaysToDateString(data.startDate, i * 7)
        const start = parseAsLocal(localDate, data.localStartTime, data.timeZone)
        const end = new Date(start.getTime() + data.durationMinutes * 60 * 1000)
        return { startDateTime: start, endDateTime: end, status: 'SCHEDULED' }
      })
    } else {
      const start = parseAsLocal(data.startDateTime.slice(0, 10), data.startDateTime.slice(11), data.timeZone)
      const end = parseAsLocal(data.endDateTime.slice(0, 10), data.endDateTime.slice(11), data.timeZone)
      if (end <= start) {
        return NextResponse.json(
          { error: 'endDateTime must be after startDateTime' },
          { status: 400 }
        )
      }
      sessions = [{ startDateTime: start, endDateTime: end, status: 'SCHEDULED' }]
    }

    const slug = await generateUniqueSlug(data.title, async (candidate) => {
      const taken = await prisma.offering.findUnique({ where: { slug: candidate } })
      return Boolean(taken)
    })

    // M1 keeps it simple: everything publishes immediately. Tiered events
    // (M2) create their TicketTier rows in the same call and flip isTicketed.
    const tiers = data.type === 'EVENT' ? data.tiers ?? [] : []
    const offering = await prisma.offering.create({
      data: {
        businessId: data.businessId,
        type: data.type,
        title: data.title,
        slug,
        styles: JSON.stringify(data.styles),
        level: data.level || null,
        description: data.description || null,
        venueName: data.venueName,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        timeZone: data.timeZone,
        price: data.price ?? null,
        capacity: data.capacity,
        partnerRequired: data.partnerRequired,
        status: 'PUBLISHED',
        isTicketed: tiers.length > 0,
        isRecurring,
        recurrenceGroupId,
        recurrenceRule,
        coverImageUrl: data.type === 'EVENT' ? data.coverImageUrl || null : null,
        djCredits: data.type === 'EVENT' ? data.djCredits || null : null,
        sessions: {
          create: sessions,
        },
        tiers: {
          create: tiers.map((t) => ({
            name: t.name,
            price: t.price,
            inventory: t.inventory,
          })),
        },
      },
      include: { sessions: true, tiers: true },
    })

    return NextResponse.json(
      {
        success: true,
        id: offering.id,
        slug: offering.slug,
        sessionIds: offering.sessions.map((s) => s.id),
        sessionCount: offering.sessions.length,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Error creating offering:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    // Unique constraint on slug lost a race with a concurrent create
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Title collision, please try again' },
        { status: 409 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
