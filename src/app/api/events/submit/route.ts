import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendEventSubmissionEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { geocodeAddress, buildGeoQuery } from '@/lib/geocode'

const schema = z.object({
  title: z.string().min(1),
  eventType: z.enum(['SOCIAL', 'TANGO_MILONGA', 'GROUP_CLASS', 'WORKSHOP', 'FESTIVAL']),
  styles: z.array(z.string()),
  startDate: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  venueName: z.string().optional(),
  address: z.string().min(1),
  price: z.string().optional(),
  organizerName: z.string().min(1),
  organizerEmail: z.string().email(),
  instagramUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  description: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  honeypot: z.string().max(0),
  isRecurring: z.boolean().default(false),
  recurrenceWeeks: z.number().min(2).max(52).optional(),
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

    // Honeypot check
    if (data.honeypot) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Rate limiting — skip for admins and when disabled via env
    const rateLimitEnabled = process.env.EVENT_RATE_LIMIT_ENABLED !== 'false'
    const userIsAdmin = isAdmin(session.user.email)

    if (rateLimitEnabled && !userIsAdmin) {
      const ip = getClientIp(request)
      const allowed = await checkRateLimit({
        identifier: ip,
        action: 'submit-event',
        limit: 10,
        window: 3600, // 1 hour
      })

      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many submissions. Please wait about an hour and try again.' },
          { status: 429 }
        )
      }
    }

    // Parse datetime
    const startDateTime = new Date(`${data.startDate}T${data.startTime}`)
    const endDateTime = data.endTime
      ? new Date(`${data.startDate}T${data.endTime}`)
      : null

    // Geocode the venue address for map view
    const geoQuery = buildGeoQuery(data.venueName || '', data.address)
    const coords = await geocodeAddress(geoQuery)

    // Look up user ID for createMany (which doesn't support connect)
    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 400 })
    }

    const sharedFields = {
      status: 'PENDING' as const,
      title: data.title,
      eventType: data.eventType,
      styles: JSON.stringify(data.styles),
      venueName: data.venueName || '',
      address: data.address,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      price: data.price ? parseInt(data.price) : null,
      organizerName: data.organizerName,
      organizerEmail: data.organizerEmail,
      instagramUrl: data.instagramUrl || null,
      websiteUrl: data.websiteUrl || null,
      imageUrl: data.imageUrl || null,
      description: data.description,
      submittedByUserId: user.id,
    }

    // Recurring event: generate N occurrences
    if (data.isRecurring && data.recurrenceWeeks && data.recurrenceWeeks >= 2) {
      const weeks = Math.min(data.recurrenceWeeks, 52)
      const recurrenceGroupId = crypto.randomUUID()
      const dayOfWeek = startDateTime.getDay()

      const eventsData = Array.from({ length: weeks }, (_, i) => {
        const occStart = new Date(startDateTime.getTime() + i * 7 * 24 * 60 * 60 * 1000)
        const occEnd = endDateTime
          ? new Date(endDateTime.getTime() + i * 7 * 24 * 60 * 60 * 1000)
          : null

        return {
          ...sharedFields,
          startDateTime: occStart,
          endDateTime: occEnd,
          isRecurring: true,
          recurrenceGroupId,
          recurrenceDay: dayOfWeek,
          recurrenceCount: weeks,
          recurrenceIndex: i + 1,
        }
      })

      await prisma.event.createMany({ data: eventsData })

      // Send ONE admin notification for the series
      await sendEventSubmissionEmail({
        eventTitle: `${data.title} (Weekly, ${weeks} weeks)`,
        organizerName: data.organizerName,
        organizerEmail: data.organizerEmail,
        eventType: data.eventType,
      })

      return NextResponse.json({ success: true, recurrenceGroupId, count: weeks })
    }

    // Single event (non-recurring)
    const event = await prisma.event.create({
      data: {
        ...sharedFields,
        startDateTime,
        endDateTime,
      },
    })

    // Send notification email to admin
    await sendEventSubmissionEmail({
      eventTitle: data.title,
      organizerName: data.organizerName,
      organizerEmail: data.organizerEmail,
      eventType: data.eventType,
    })

    return NextResponse.json({ success: true, id: event.id })
  } catch (error: any) {
    console.error('Error submitting event:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const updateSchema = schema.omit({ honeypot: true }).partial().extend({
  eventId: z.string().min(1),
})

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const body = await request.json()
    const { eventId, ...data } = updateSchema.parse(body)

    // Ownership check
    const existing = await prisma.event.findUnique({ where: { id: eventId } })
    if (!existing || existing.submittedByUserId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (existing.status !== 'PENDING') {
      return NextResponse.json({ error: 'Only pending events can be edited' }, { status: 400 })
    }

    // Build update payload
    const update: any = {}
    if (data.title) update.title = data.title
    if (data.eventType) update.eventType = data.eventType
    if (data.styles) update.styles = JSON.stringify(data.styles)
    if (data.startDate && data.startTime) {
      update.startDateTime = new Date(`${data.startDate}T${data.startTime}`)
    }
    if (data.endTime !== undefined) {
      update.endDateTime = data.startDate && data.endTime
        ? new Date(`${data.startDate}T${data.endTime}`)
        : null
    }
    if (data.venueName !== undefined) update.venueName = data.venueName || ''
    if (data.address !== undefined) update.address = data.address || null
    if (data.price !== undefined) update.price = data.price ? parseInt(data.price) : null
    if (data.organizerName) update.organizerName = data.organizerName
    if (data.organizerEmail) update.organizerEmail = data.organizerEmail
    if (data.instagramUrl !== undefined) update.instagramUrl = data.instagramUrl || null
    if (data.websiteUrl !== undefined) update.websiteUrl = data.websiteUrl || null
    if (data.description) update.description = data.description
    if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl || null

    // Re-geocode if address changed
    if (data.address && data.address !== existing.address) {
      const geoQuery = buildGeoQuery(data.venueName || existing.venueName, data.address)
      const coords = await geocodeAddress(geoQuery)
      update.lat = coords?.lat ?? null
      update.lng = coords?.lng ?? null
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: update,
    })

    return NextResponse.json(event)
  } catch (error: any) {
    console.error('Error updating event:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const { eventId, deleteSeries } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    }

    // Ownership check
    const existing = await prisma.event.findUnique({ where: { id: eventId } })
    if (!existing || existing.submittedByUserId !== session.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Delete entire series if requested
    if (deleteSeries && existing.recurrenceGroupId) {
      await prisma.event.deleteMany({
        where: {
          recurrenceGroupId: existing.recurrenceGroupId,
          submittedByUserId: session.user.id,
        },
      })
      return NextResponse.json({ success: true, seriesDeleted: true })
    }

    await prisma.event.delete({ where: { id: eventId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
