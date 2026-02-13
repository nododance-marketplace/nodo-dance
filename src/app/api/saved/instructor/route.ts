import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Toggle save/unsave an instructor
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

    const { instructorId } = await request.json()

    if (!instructorId) {
      return NextResponse.json({ error: 'instructorId required' }, { status: 400 })
    }

    // Check if already saved
    const existing = await prisma.savedInstructor.findUnique({
      where: {
        userId_instructorId: {
          userId: user.id,
          instructorId,
        },
      },
    })

    if (existing) {
      // Unsave
      await prisma.savedInstructor.delete({ where: { id: existing.id } })
      return NextResponse.json({ saved: false })
    } else {
      // Save
      await prisma.savedInstructor.create({
        data: { userId: user.id, instructorId },
      })
      return NextResponse.json({ saved: true })
    }
  } catch (error) {
    console.error('[SavedInstructor] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Get saved status for an instructor (or list all saved)
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

    const instructorId = request.nextUrl.searchParams.get('instructorId')

    if (instructorId) {
      const saved = await prisma.savedInstructor.findUnique({
        where: {
          userId_instructorId: {
            userId: user.id,
            instructorId,
          },
        },
      })
      return NextResponse.json({ saved: !!saved })
    }

    // Return all saved instructor IDs
    const savedInstructors = await prisma.savedInstructor.findMany({
      where: { userId: user.id },
      select: { instructorId: true },
    })

    return NextResponse.json({
      savedIds: savedInstructors.map((s) => s.instructorId),
    })
  } catch (error) {
    console.error('[SavedInstructor GET] Error:', error)
    return NextResponse.json({ saved: false })
  }
}
