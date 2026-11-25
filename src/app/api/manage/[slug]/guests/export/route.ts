import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Guest-list CSV export (M2). Staff of the business (OWNER / INSTRUCTOR /
 * CHECKIN) can download the door list for one of its events — ticket codes,
 * holder, tier, statuses. Plain text/csv response, no dependencies.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
  }
  const { slug } = await params

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

  const business = await prisma.business.findFirst({
    where: { slug, members: { some: { userId: user.id } } },
    select: { id: true, name: true },
  })
  if (!business) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const offeringId = request.nextUrl.searchParams.get('offeringId')
  if (!offeringId) {
    return NextResponse.json({ error: 'offeringId is required' }, { status: 400 })
  }

  // Event must belong to THIS business
  const offering = await prisma.offering.findFirst({
    where: { id: offeringId, businessId: business.id, type: 'EVENT' },
    select: { title: true },
  })
  if (!offering) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const tickets = await prisma.ticket.findMany({
    where: { offeringId },
    orderBy: { createdAt: 'asc' },
    include: {
      tier: { select: { name: true } },
      order: { select: { status: true, amount: true, currency: true } },
      checkIns: { select: { createdAt: true } },
    },
  })

  const escape = (value: string | number | null | undefined): string => {
    const s = String(value ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const rows = [
    'code,holder_name,holder_email,tier,ticket_status,order_status,amount,currency,checked_in_at,issued_at',
    ...tickets.map((t) =>
      [
        escape(t.code),
        escape(t.holderName ?? ''),
        escape(t.holderEmail),
        escape(t.tier?.name ?? 'GA'),
        escape(t.status),
        escape(t.order?.status ?? (t.orderId ? 'UNKNOWN' : 'FREE')),
        escape(t.order?.amount ?? ''),
        escape(t.order?.currency ?? ''),
        escape(t.checkIns[0]?.createdAt.toISOString() ?? ''),
        escape(t.createdAt.toISOString()),
      ].join(',')
    ),
  ]

  const filename = `${offering.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guests'}-guest-list.csv`

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
