import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseJsonArray } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const styles = searchParams.get('styles')?.split(',').filter(Boolean) || []
  const lessonType = searchParams.get('lessonType')
  const locationType = searchParams.get('locationType')
  const minPrice = searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!) : undefined
  const maxPrice = searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!) : undefined
  const sortBy = searchParams.get('sortBy') || 'recommended'

  try {
    const instructors = await prisma.instructorProfile.findMany({
      where: {
        isPublished: true,
        AND: [
          search
            ? {
                OR: [
                  { displayName: { contains: search } },
                  { neighborhood: { contains: search } },
                ],
              }
            : {},
          lessonType === 'PRIVATE' ? { offersPrivate: true } : {},
          lessonType === 'GROUP' ? { offersGroup: true } : {},
          locationType ? { locationType: locationType as any } : {},
          minPrice !== undefined ? { privateRateHourly: { gte: minPrice } } : {},
          maxPrice !== undefined ? { privateRateHourly: { lte: maxPrice } } : {},
        ],
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    })

    // Filter by styles (stored as JSON)
    let filtered = instructors
    if (styles.length > 0) {
      filtered = instructors.filter((instructor) => {
        const instructorStyles = parseJsonArray(instructor.styles)
        return styles.some((style) => instructorStyles.includes(style))
      })
    }

    // Sort
    if (sortBy === 'price-low') {
      filtered.sort((a, b) => (a.privateRateHourly || 999999) - (b.privateRateHourly || 999999))
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => (b.privateRateHourly || 0) - (a.privateRateHourly || 0))
    } else if (sortBy === 'most-styles') {
      filtered.sort((a, b) => parseJsonArray(b.styles).length - parseJsonArray(a.styles).length)
    }

    return NextResponse.json(filtered)
  } catch (error) {
    console.error('Error fetching instructors:', error)
    return NextResponse.json([], { status: 500 })
  }
}
