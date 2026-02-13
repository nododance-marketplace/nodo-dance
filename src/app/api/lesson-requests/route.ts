import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { sendLessonRequestEmail } from '@/lib/email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  instructorProfileId: z.string(),
  studentName: z.string().min(1),
  studentEmail: z.string().email(),
  studentPhone: z.string().optional(),
  style: z.string(),
  lessonType: z.enum(['PRIVATE', 'GROUP', 'EITHER']),
  preferredTimes: z.string(),
  message: z.string().min(10),
  honeypot: z.string().max(0),
})

export async function POST(request: NextRequest) {
  try {
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
      action: 'lesson-request',
      limit: 5,
      window: 3600, // 1 hour
    })

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    // Get instructor
    const instructor = await prisma.instructorProfile.findUnique({
      where: { id: data.instructorProfileId },
      include: { user: true },
    })

    if (!instructor) {
      return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
    }

    // Create lesson request
    const lessonRequest = await prisma.lessonRequest.create({
      data: {
        instructorProfileId: data.instructorProfileId,
        studentName: data.studentName,
        studentEmail: data.studentEmail,
        studentPhone: data.studentPhone,
        style: data.style,
        lessonType: data.lessonType,
        preferredTimes: data.preferredTimes,
        message: data.message,
      },
    })

    // Send emails
    await sendLessonRequestEmail({
      instructorName: instructor.displayName,
      instructorEmail: instructor.user.email,
      studentName: data.studentName,
      studentEmail: data.studentEmail,
      studentPhone: data.studentPhone,
      style: data.style,
      lessonType: data.lessonType,
      preferredTimes: data.preferredTimes,
      message: data.message,
    })

    return NextResponse.json({ success: true, id: lessonRequest.id })
  } catch (error: any) {
    console.error('Error creating lesson request:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
