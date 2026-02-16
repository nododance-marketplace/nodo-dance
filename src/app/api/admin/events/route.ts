import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { geocodeAddress, buildGeoQuery } from '@/lib/geocode'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null
  }
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(events)
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { eventId, status } = await request.json()

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    let event = await prisma.event.update({
      where: { id: eventId },
      data: { status },
    })

    // On approval, retry geocoding if coordinates are missing
    if (status === 'APPROVED' && event.lat == null && event.lng == null) {
      const geoQuery = buildGeoQuery(event.venueName, event.address, event.neighborhood)
      const coords = await geocodeAddress(geoQuery)
      if (coords) {
        event = await prisma.event.update({
          where: { id: eventId },
          data: { lat: coords.lat, lng: coords.lng },
        })
      }
    }

    // Revalidate events pages so approved events appear immediately
    revalidatePath('/events')
    revalidatePath(`/events/${event.id}`)

    return NextResponse.json(event)
  } catch (error) {
    console.error('Error updating event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
