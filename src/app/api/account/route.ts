import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
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

    // Delete everything in a transaction
    await prisma.$transaction([
      prisma.savedInstructor.deleteMany({ where: { userId: user.id } }),
      prisma.savedEvent.deleteMany({ where: { userId: user.id } }),
      prisma.lessonRequest.deleteMany({
        where: { instructorProfile: { userId: user.id } },
      }),
      prisma.savedInstructor.deleteMany({
        where: { instructor: { userId: user.id } },
      }),
      prisma.instructorProfile.deleteMany({ where: { userId: user.id } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
      prisma.account.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Delete Account] Error:', error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
