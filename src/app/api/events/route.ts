import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseJsonArray } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const styles = searchParams.get('styles')?.split(',').filter(Boolean) || []
  const eventTypes = searchParams.get('eventTypes')?.split(',').filter(Boolean) || []
  const dateFilter = searchParams.get('dateFilter') || 'upcoming'

  // Month-based filtering for calendar view
  const monthStart = searchParams.get('monthStart')
  const monthEnd = searchParams.get('monthEnd')

  try {
    const now = new Date()
    let startDate: Date | undefined
    let endDate: Date | undefined

    // If month range is provided, use it (for calendar view)
    if (monthStart && monthEnd) {
      startDate = new Date(monthStart)
      endDate = new Date(monthEnd)
    } else if (dateFilter === 'this-week') {
      startDate = now
      endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    } else if (dateFilter === 'this-month') {
      startDate = now
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else {
      // upcoming (default)
      startDate = now
    }

    const events = await prisma.event.findMany({
      where: {
        status: 'APPROVED',
        AND: [
          search
            ? {
                OR: [
                  { title: { contains: search } },
                  { venueName: { contains: search } },
                  { neighborhood: { contains: search } },
                ],
              }
            : {},
          startDate ? { startDateTime: { gte: startDate } } : {},
          endDate ? { startDateTime: { lte: endDate } } : {},
          eventTypes.length > 0 ? { eventType: { in: eventTypes } } : {},
        ],
      },
      orderBy: {
        startDateTime: 'asc',
      },
    })

    // Filter by styles (stored as JSON)
    let filtered = events
    if (styles.length > 0) {
      filtered = events.filter((event: typeof events[0]) => {
        const eventStyles = parseJsonArray(event.styles)
        return styles.some((style) => eventStyles.includes(style))
      })
    }

    return NextResponse.json(filtered)
  } catch (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}
