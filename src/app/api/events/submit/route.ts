import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendEventSubmissionEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  title: z.string().min(1),
  eventType: z.enum(['SOCIAL', 'TANGO_MILONGA', 'GROUP_CLASS', 'WORKSHOP', 'FESTIVAL']),
  styles: z.array(z.string()),
  startDate: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  venueName: z.string().min(1),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  price: z.string().optional(),
  organizerName: z.string().min(1),
  organizerEmail: z.string().email(),
  instagramUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  description: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  honeypot: z.string().max(0),
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

    // Rate limiting
    const ip = getClientIp(request)
    const allowed = await checkRateLimit({
      identifier: ip,
      action: 'submit-event',
      limit: 3,
      window: 3600, // 1 hour
    })

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.' },
        { status: 429 }
      )
    }

    // Parse datetime
    const startDateTime = new Date(`${data.startDate}T${data.startTime}`)
    const endDateTime = data.endTime
      ? new Date(`${data.startDate}T${data.endTime}`)
      : null

    // Create event
    const event = await prisma.event.create({
      data: {
        status: 'PENDING',
        title: data.title,
        eventType: data.eventType,
        styles: JSON.stringify(data.styles),
        startDateTime,
        endDateTime,
        venueName: data.venueName,
        neighborhood: data.neighborhood || null,
        address: data.address || null,
        price: data.price ? parseInt(data.price) : null,
        organizerName: data.organizerName,
        organizerEmail: data.organizerEmail,
        instagramUrl: data.instagramUrl || null,
        websiteUrl: data.websiteUrl || null,
        imageUrl: data.imageUrl || null,
        description: data.description,
        submittedBy: { connect: { email: session.user.email } },
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
