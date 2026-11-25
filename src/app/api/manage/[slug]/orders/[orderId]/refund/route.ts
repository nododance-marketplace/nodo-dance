import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

/**
 * Refund a paid order (M2). OWNER-only, business-scoped: the order must belong
 * to an offering of this business. Creates the Stripe refund on the connected
 * account and flips the local state machine immediately — the charge.refunded
 * webhook replay is a no-op (status guard), so the two paths converge.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; orderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }
    const { slug, orderId } = await params

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 400 })

    const business = await prisma.business.findFirst({
      where: {
        slug,
        members: { some: { userId: user.id, role: 'OWNER' } },
      },
      select: { id: true, stripeAccountId: true },
    })
    if (!business) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'PAYMENTS_UNAVAILABLE' }, { status: 503 })
    }

    // Order must belong to THIS business and be refundable
    const order = await prisma.order.findFirst({
      where: { id: orderId, offering: { businessId: business.id } },
      include: { ticket: true, reservation: true },
    })
    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (order.status !== 'PAID') {
      return NextResponse.json(
        { error: 'NOT_REFUNDABLE', message: `Order is ${order.status}, not PAID` },
        { status: 409 }
      )
    }
    if (!order.stripePaymentIntentId) {
      return NextResponse.json({ error: 'NO_PAYMENT_INTENT' }, { status: 409 })
    }

    // Refund on the connected account (the charge lives there)
    await getStripe().refunds.create(
      { payment_intent: order.stripePaymentIntentId },
      business.stripeAccountId ? { stripeAccount: business.stripeAccountId } : undefined
    )

    // Local flip — webhook will replay as a no-op thanks to the status guard
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: { in: ['PENDING_PAYMENT', 'PAID'] } },
        data: { status: 'REFUNDED' },
      })
      if (updated.count === 0) return
      if (order.ticket) {
        await tx.ticket.update({
          where: { id: order.ticket.id },
          data: { status: 'REFUNDED' },
        })
      }
      if (order.reservation && order.reservation.status === 'CONFIRMED') {
        await tx.reservation.update({
          where: { id: order.reservation.id },
          data: { status: 'CANCELED' },
        })
      }
    })

    return NextResponse.json({ success: true, status: 'REFUNDED' })
  } catch (error: any) {
    console.error('[REFUND] Failed:', error)
    const code = error?.code
    if (code === 'charge_already_refunded') {
      return NextResponse.json({ error: 'ALREADY_REFUNDED' }, { status: 409 })
    }
    return NextResponse.json({ error: 'REFUND_FAILED' }, { status: 500 })
  }
}
