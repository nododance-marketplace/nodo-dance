import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'
import { resolveMarket } from '@/lib/markets-server'
import { EventCard } from '@/components/events/event-card'
import { Button } from '@/components/ui/button'
import { MapPin, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return MARKETS.map((m) => ({ slug: m.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const market = await resolveMarket(slug)
  if (!market) return { title: 'City not found — Nodo Dance' }

  return {
    title: `Dance Events in ${market.label} — Nodo Dance`,
    description: `${market.tagline ?? `Partner dancing in ${market.label}.`} Find salsa, bachata, kizomba, tango and West Coast Swing socials, classes and workshops in ${market.label}.`,
    openGraph: {
      title: `Dance Events in ${market.label} — Nodo Dance`,
      description: market.tagline ?? `Partner dancing in ${market.label}.`,
      type: 'website',
    },
  }
}

export default async function CityPage({ params }: PageProps) {
  const { slug } = await params
  const market = await resolveMarket(slug)
  if (!market) notFound()

  const now = new Date()
  const inNinetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      status: 'APPROVED',
      city: { in: market.cities, mode: 'insensitive' },
      startDateTime: { gte: now, lte: inNinetyDays },
    },
    orderBy: { startDateTime: 'asc' },
    take: 12,
    select: {
      id: true,
      title: true,
      eventType: true,
      styles: true,
      venueName: true,
      address: true,
      city: true,
      state: true,
      startDateTime: true,
      price: true,
      lat: true,
      lng: true,
      isRecurring: true,
      recurrenceInterval: true,
    },
  })

  const total = await prisma.event.count({
    where: {
      status: 'APPROVED',
      city: { in: market.cities, mode: 'insensitive' },
      startDateTime: { gte: now },
    },
  })

  const styles = new Set<string>()
  for (const e of await prisma.event.findMany({
    where: {
      status: 'APPROVED',
      city: { in: market.cities, mode: 'insensitive' },
      startDateTime: { gte: now },
    },
    select: { styles: true },
  })) {
    try {
      for (const s of JSON.parse(e.styles || '[]') as string[]) {
        if (s !== 'Other') styles.add(s)
      }
    } catch {
      // A malformed style list is not worth breaking the page over.
    }
  }

  return (
    <div className="page-shell">
      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <MapPin className="w-4 h-4 text-primary" aria-hidden="true" />
          <span>{market.label}</span>
        </div>
        <h1 className="page-heading mb-3">
          Partner dancing in {market.name}
        </h1>
        <p className="page-intro max-w-2xl mb-6">
          {market.tagline} {total > 0
            ? `We have ${total} upcoming event${total === 1 ? '' : 's'} listed here.`
            : 'We are just getting started here.'}
        </p>

        {styles.size > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {[...styles].sort().map((s) => (
              <span key={s} className="px-3 py-1 rounded-full bg-white border border-gray-200 text-sm text-gray-700">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href={`/events?market=${market.slug}&view=list&dateFilter=this-month`}>
            <Button variant="gradient">
              Browse all {market.name} events
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href={`/events?market=${market.slug}&view=map`}>
            <Button variant="outline">See them on a map</Button>
          </Link>
        </div>
      </section>

      {/* Upcoming */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Coming up in {market.name}</h2>

        {events.length === 0 ? (
          <div className="text-center py-16 px-6 bg-white border border-gray-200 rounded-xl">
            <p className="text-xl text-gray-600 mb-2">No events listed yet</p>
            <p className="text-gray-500 mb-6">
              We are adding {market.name} now. If you know a studio that runs socials or classes, tell us about it.
            </p>
            <Link href="/submit-event">
              <Button variant="gradient">Submit an event</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              {events.map((event) => (
                <EventCard key={event.id} event={event as never} />
              ))}
            </div>
            <Link
              href={`/events?market=${market.slug}&view=list&dateFilter=this-month`}
              className="text-accent-magenta font-medium hover:underline inline-flex items-center gap-1"
            >
              See all {total} upcoming {market.name} events
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </section>
    </div>
  )
}
