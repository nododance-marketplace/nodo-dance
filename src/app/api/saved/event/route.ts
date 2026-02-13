import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Toggle save/unsave an event
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { eventId } = await request.json()

    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    }

    const existing = await prisma.savedEvent.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId,
        },
      },
    })

    if (existing) {
      await prisma.savedEvent.delete({ where: { id: existing.id } })
      return NextResponse.json({ saved: false })
    } else {
      await prisma.savedEvent.create({
        data: { userId: user.id, eventId },
      })
      return NextResponse.json({ saved: true })
    }
  } catch (error) {
    console.error('[SavedEvent] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ saved: false })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ saved: false })
    }

    const eventId = request.nextUrl.searchParams.get('eventId')

    if (eventId) {
      const saved = await prisma.savedEvent.findUnique({
        where: {
          userId_eventId: { userId: user.id, eventId },
        },
      })
      return NextResponse.json({ saved: !!saved })
    }

    const savedEvents = await prisma.savedEvent.findMany({
      where: { userId: user.id },
      select: { eventId: true },
    })

    return NextResponse.json({
      savedIds: savedEvents.map((s) => s.eventId),
    })
  } catch (error) {
    console.error('[SavedEvent GET] Error:', error)
    return NextResponse.json({ saved: false })
  }
}
