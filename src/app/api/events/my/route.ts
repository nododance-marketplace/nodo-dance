import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
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
