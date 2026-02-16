import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // If ?id= is provided, return a single event (admin or owner)
    const eventId = request.nextUrl.searchParams.get('id')
    if (eventId) {
      const event = await prisma.event.findUnique({ where: { id: eventId } })
      if (!event) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }

      const userIsAdmin = isAdmin(session.user.email)
      const isOwner = event.submittedByUserId === session.user.id
      if (!isOwner && !userIsAdmin) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }

      return NextResponse.json(event)
    }

    // Default: return all user's events
    const events = await prisma.event.findMany({
      where: { submittedByUserId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(events)
  } catch (error) {
    console.error('Error fetching user events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
