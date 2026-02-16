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
      include: {
        submittedBy: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(events)
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { eventId, deleteSeries } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    }

    // Delete entire series if requested
    if (deleteSeries) {
      const event = await prisma.event.findUnique({ where: { id: eventId } })
      if (event?.recurrenceGroupId) {
        const result = await prisma.event.deleteMany({
          where: { recurrenceGroupId: event.recurrenceGroupId },
        })
        revalidatePath('/events')
        return NextResponse.json({ success: true, count: result.count })
      }
    }

    await prisma.event.delete({ where: { id: eventId } })
    revalidatePath('/events')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { eventId, status, action, seriesAction } = body

    // Series approve/reject: update all events sharing recurrenceGroupId
    if (seriesAction === 'approve-series' || seriesAction === 'reject-series') {
      const event = await prisma.event.findUnique({ where: { id: eventId } })
      if (!event?.recurrenceGroupId) {
        return NextResponse.json({ error: 'Not a recurring event' }, { status: 400 })
      }

      const newStatus = seriesAction === 'approve-series' ? 'APPROVED' : 'REJECTED'
      const result = await prisma.event.updateMany({
        where: { recurrenceGroupId: event.recurrenceGroupId },
        data: { status: newStatus },
      })

      // On series approval, geocode if missing coords (once, then apply to all)
      if (newStatus === 'APPROVED' && (event.lat == null || event.lng == null)) {
        const geoQuery = buildGeoQuery(event.venueName, event.address)
        const coords = await geocodeAddress(geoQuery)
        if (coords) {
          await prisma.event.updateMany({
            where: { recurrenceGroupId: event.recurrenceGroupId },
            data: { lat: coords.lat, lng: coords.lng },
          })
          console.log(`[Admin] Series geocoded "${event.title}" → ${coords.lat}, ${coords.lng}`)
        }
      }

      revalidatePath('/events')
      return NextResponse.json({ success: true, count: result.count })
    }

    // Bulk re-geocode: find all events missing coords and geocode them
    if (action === 'geocode-all') {
      const missing = await prisma.event.findMany({
        where: {
          OR: [{ lat: null }, { lng: null }],
          address: { not: null },
        },
      })

      console.log(`[Admin] Bulk re-geocode: ${missing.length} events missing coordinates`)

      let success = 0
      let failed = 0
      for (const ev of missing) {
        const geoQuery = buildGeoQuery(ev.venueName, ev.address)
        const coords = await geocodeAddress(geoQuery)
        if (coords) {
          await prisma.event.update({
            where: { id: ev.id },
            data: { lat: coords.lat, lng: coords.lng },
          })
          success++
          console.log(`[Admin] Bulk geocoded "${ev.title}" → ${coords.lat}, ${coords.lng}`)
        } else {
          failed++
          console.warn(`[Admin] Bulk geocode FAILED: "${ev.title}" (address: "${ev.address}")`)
        }
        // Small delay to respect Nominatim rate limit (1 req/sec)
        await new Promise((r) => setTimeout(r, 1100))
      }

      revalidatePath('/events')
      return NextResponse.json({ total: missing.length, success, failed })
    }

    // Re-geocode action (admin can force re-geocode any event)
    if (action === 'geocode') {
      let event = await prisma.event.findUnique({ where: { id: eventId } })
      if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      console.log(`[Admin] Force re-geocode: "${event.title}" (address: "${event.address}", venue: "${event.venueName}")`)
      const geoQuery = buildGeoQuery(event.venueName, event.address)
      const coords = await geocodeAddress(geoQuery)
      if (coords) {
        event = await prisma.event.update({
          where: { id: eventId },
          data: { lat: coords.lat, lng: coords.lng },
        })
        console.log(`[Admin] Re-geocoded "${event.title}" → ${coords.lat}, ${coords.lng}`)
        return NextResponse.json(event)
      } else {
        console.warn(`[Admin] Re-geocode FAILED for "${event.title}"`)
        return NextResponse.json({ error: `Geocoding failed for address: "${event.address || event.venueName}"` }, { status: 422 })
      }
    }

    // Status update action
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    let event = await prisma.event.update({
      where: { id: eventId },
      data: { status },
    })

    // On approval, always try geocoding if coordinates are missing
    if (status === 'APPROVED' && (event.lat == null || event.lng == null)) {
      console.log(`[Admin] Geocoding event "${event.title}" (address: "${event.address}", venue: "${event.venueName}")`)
      const geoQuery = buildGeoQuery(event.venueName, event.address)
      const coords = await geocodeAddress(geoQuery)
      if (coords) {
        event = await prisma.event.update({
          where: { id: eventId },
          data: { lat: coords.lat, lng: coords.lng },
        })
        console.log(`[Admin] Geocoded "${event.title}" → ${coords.lat}, ${coords.lng}`)
      } else {
        console.warn(`[Admin] Geocoding FAILED for "${event.title}" — event will NOT appear on map`)
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
