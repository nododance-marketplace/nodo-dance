import Link from 'next/link'
import { Heart, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/reveal'
import { HeroTitle } from '@/components/home/HeroTitle'
import { HeroEmblem } from '@/components/home/HeroEmblem'
import { MagneticLink } from '@/components/home/MagneticLink'
import { EventTicker, type TickerItem } from '@/components/home/EventTicker'
import { LiveClock } from '@/components/home/LiveClock'
import { HomeMapDemo } from '@/components/home/HomeMapDemo'
import { Counter } from '@/components/home/Counter'
import type { MapEvent } from '@/components/events/events-map-view'
import { DANCE_STYLES } from '@/lib/constants'
import { DANCE_STYLE_COLORS } from '@/lib/styleColors'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'
import { formatTime, parseJsonArray } from '@/lib/utils'
import type { CSSProperties } from 'react'

export const dynamic = 'force-dynamic'

const CITY_TONES = ['var(--color-peach)', 'var(--color-lilac)', 'var(--color-sea)']

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

export default async function HomePage() {
  const now = new Date()

  // The cities that actually have something on right now. A city with no
  // events yet is still coming, but it is not somewhere to send a visitor.
  const counts = await prisma.event.groupBy({
    by: ['city'],
    where: { status: 'APPROVED', startDateTime: { gte: now } },
    _count: { _all: true },
  })
  const byCity = new Map(counts.map((c) => [c.city ?? '', c._count._all]))
  const liveMarkets = MARKETS.map((m) => ({
    ...m,
    events: m.cities.reduce((sum, city) => sum + (byCity.get(city) ?? 0), 0),
  }))
    .filter((m) => m.events > 0)
    .sort((a, b) => b.events - a.events)

  const totalEvents = liveMarkets.reduce((sum, m) => sum + m.events, 0)

  // Real events make the ticker: title, city and start time, soonest first.
  const upcoming = await prisma.event.findMany({
    where: { status: 'APPROVED', startDateTime: { gte: now } },
    orderBy: { startDateTime: 'asc' },
    take: 12,
    select: { id: true, title: true, city: true, startDateTime: true },
  })
  const tickerItems: TickerItem[] = upcoming.map((e) => ({
    id: e.id,
    title: e.title,
    city: e.city,
    when: `${shortDate(e.startDateTime)} · ${formatTime(e.startDateTime)}`,
  }))

  // The live-map demo rides the market with the busiest calendar — the same
  // groupBy pattern as above decides it, so it always follows the real data.
  const demoMarket = liveMarkets[0]
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [eventsThisWeek, instructorCount, demoEvents, showcase] = await Promise.all([
    prisma.event.count({
      where: { status: 'APPROVED', startDateTime: { gte: now, lte: weekAhead } },
    }),
    prisma.instructorProfile.count(),
    demoMarket
      ? prisma.event.findMany({
          where: {
            status: 'APPROVED',
            startDateTime: { gte: now },
            city: { in: demoMarket.cities },
            lat: { not: null },
            lng: { not: null },
          },
          orderBy: { startDateTime: 'asc' },
          take: 90,
          select: {
            id: true,
            title: true,
            eventType: true,
            venueName: true,
            address: true,
            styles: true,
            startDateTime: true,
            endDateTime: true,
            price: true,
            lat: true,
            lng: true,
          },
        })
      : Promise.resolve([]),
    // The showcase shows real faces only. A profile without a photo is a
    // listing, not a card, so it waits on the directory page.
    prisma.instructorProfile.findMany({
      where: { photoUrl: { not: null } },
      orderBy: { rating: 'desc' },
      take: 6,
      select: {
        slug: true,
        displayName: true,
        headline: true,
        photoUrl: true,
        styles: true,
        city: true,
        neighborhood: true,
      },
    }),
  ])

  const demoMapEvents: MapEvent[] = demoEvents.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.eventType,
    venueName: e.venueName,
    address: e.address,
    styles: e.styles,
    startDateTime: e.startDateTime,
    endDateTime: e.endDateTime,
    lat: e.lat as number,
    lng: e.lng as number,
    price: e.price,
  }))

  const styles = DANCE_STYLES.filter(s => s !== 'Other')

  return (
    <div>
      <section className="home-hero">
        <div className="home-container">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <HeroTitle />
              <p>Find your instructors. Find your socials. Find your people.</p>
              <div className="home-actions">
                <MagneticLink href="/events">
                  <Button variant="gradient" size="lg">Explore Events</Button>
                </MagneticLink>
                <MagneticLink href="/instructors">
                  <Button variant="outline" size="lg">Find Instructors</Button>
                </MagneticLink>
              </div>
            </div>
            <div className="community-visual">
              <HeroEmblem />
              <div className="community-styles" aria-label="Partner dance communities">
                {['Salsa', 'Bachata', 'Kizomba', 'West Coast Swing', 'Tango', 'Zouk'].map(style => (
                  <span key={style} style={{ '--style-color': DANCE_STYLE_COLORS[style] } as CSSProperties}>{style}</span>
                ))}
              </div>
              <p className="community-caption">Connecting the Dance Community.</p>
            </div>
          </div>
          <div className="home-location"><MapPin className="h-4 w-4" aria-hidden="true" /><span>Rooted in {liveMarkets.length} dance {liveMarkets.length === 1 ? 'community' : 'communities'}</span></div>
        </div>
      </section>

      {tickerItems.length > 0 ? (
        <EventTicker items={tickerItems} />
      ) : (
        <section className="style-marquee" aria-hidden="true">
          <div className="style-marquee-track">
            {[0, 1].map(track =>
              styles.map(style => (
                <span key={`${track}-${style}`} className="style-marquee-item">{style}</span>
              ))
            )}
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head"><h2>How It Works</h2><p>Three steps. No wrong footwork.</p></div>
          </Reveal>
          <div className="home-steps">
            {[
              { n: '01', title: 'Browse', copy: 'Scout the instructors and the socials — who\u2019s teaching, what\u2019s on, where.' },
              { n: '02', title: 'Connect', copy: 'Say hello. Book a lesson, save a social, claim your spot.' },
              { n: '03', title: 'Dance', copy: 'Show up. Nobody remembers their first night except as the night they started.' },
            ].map((step, i) => (
              <Reveal key={step.n} as="article" className="home-step" delay={i * 110} y={28}>
                <span>{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <HomeMapDemo events={demoMapEvents} marketName={demoMarket?.name ?? ''} />

      <section className="home-section">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head">
              <div>
                <h2>Nothing <em>staged</em>.</h2>
                <p>Counted from the directory the moment this page loaded.</p>
              </div>
            </div>
          </Reveal>
          <div className="home-proof-band">
            <Reveal className="home-proof-item" y={16}>
              <Counter value={counts.length} />
              <span className="home-proof-label">cities covered</span>
            </Reveal>
            <Reveal className="home-proof-item" delay={90} y={16}>
              <Counter value={eventsThisWeek} />
              <span className="home-proof-label">events this week</span>
            </Reveal>
            <Reveal className="home-proof-item" delay={180} y={16}>
              <span className="home-proof-number">$0</span>
              <span className="home-proof-label">what it costs to list</span>
            </Reveal>
            <Reveal className="home-proof-item" delay={270} y={16}>
              <Counter value={instructorCount} />
              <span className="home-proof-label">instructors on the platform</span>
            </Reveal>
          </div>
          <Reveal>
            <p className="home-proof-foot">real numbers, counted live — every page load.</p>
          </Reveal>
        </div>
      </section>

      {showcase.length > 0 && (
        <section className="home-section">
          <div className="home-container">
            <Reveal>
              <div className="home-section-head">
                <div>
                  <h2>On the floor, <em>now</em>.</h2>
                  <p>Every profile here is live — request a lesson and it goes straight to them.</p>
                </div>
                <Link href="/instructors" className="showcase-all">Meet every instructor <span aria-hidden="true">→</span></Link>
              </div>
            </Reveal>
            <div className="showcase-row">
              {showcase.map((p, i) => {
                const profileStyles = parseJsonArray(p.styles)
                const primary = profileStyles[0] ?? 'Other'
                return (
                  <Reveal key={p.slug} delay={(i % 3) * 80} y={20}>
                    <Link
                      href={`/instructors/${p.slug}`}
                      className="showcase-card"
                      aria-label={`Request a lesson with ${p.displayName}`}
                    >
                      <span className="showcase-chrome" aria-hidden="true">
                        <i /><i /><i />
                      </span>
                      <span className="showcase-photo-frame">
                        <img src={p.photoUrl!} alt={`Portrait of ${p.displayName}`} loading="lazy" />
                      </span>
                      <span className="showcase-body">
                        <strong>{p.displayName}</strong>
                        {p.headline && <span className="showcase-headline">{p.headline}</span>}
                        <span className="showcase-dots" aria-hidden="true">
                          {profileStyles.slice(0, 4).map(style => (
                            <i
                              key={style}
                              className="showcase-dot"
                              style={{ background: DANCE_STYLE_COLORS[style] ?? DANCE_STYLE_COLORS.Other }}
                            />
                          ))}
                          <span className="showcase-style-name">{primary}</span>
                        </span>
                        <span className="showcase-city">{p.city ?? p.neighborhood ?? 'near you'}</span>
                        <span className="showcase-cta">request a lesson <span aria-hidden="true">→</span></span>
                      </span>
                    </Link>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className="home-section">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head"><h2>Find Your City</h2><p>{totalEvents} events on the calendar across {liveMarkets.length} {liveMarkets.length === 1 ? 'city' : 'cities'}.</p></div>
          </Reveal>
          <div className="city-index">
            {liveMarkets.map((m, i) => (
              <Reveal key={m.slug} delay={(i % 4) * 70} y={18}>
                <Link
                  href={`/cities/${m.slug}`}
                  className="city-row"
                  style={{ '--city-tone': CITY_TONES[i % CITY_TONES.length] } as CSSProperties}
                >
                  <span className="city-row-name">{m.name.toLowerCase()}</span>
                  <span className="city-row-meta">{m.state} — {m.tagline}</span>
                  <span className="city-row-count">
                    {m.events} upcoming event{m.events === 1 ? '' : 's'}
                  </span>
                  <span className="city-row-arrow" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-6">
            <Link href="/cities" className="text-accent-magenta font-medium hover:underline">See every city we cover</Link>
          </div>
        </div>
      </section>

      <section className="home-section home-styles">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head"><h2>Dance Styles We Love</h2><p>Pick a dance. There&apos;s a teacher and a social for it.</p></div>
          </Reveal>
          <div className="style-flood-list">
            {styles.map((style, i) => (
              <Reveal key={style} delay={(i % 4) * 70} y={18} style={{ '--style-color': DANCE_STYLE_COLORS[style] } as CSSProperties}>
                <div className="style-flood">
                  <h3>{style}</h3>
                  <span className="style-flood-dot" aria-hidden="true" />
                  <Heart className="h-5 w-5" aria-hidden="true" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="home-drop">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head drop-head">
              <h2>Every City&apos;s Scene, In One Place</h2>
              <p>One directory for every social, class, and festival we know about.</p>
            </div>
          </Reveal>
          <div className="drop-grid">
            <Reveal as="article" y={28}>
              <h2>Have an Event?</h2>
              <p>Your social, your workshop, your festival — in front of the dancers who&apos;ll actually come. Free, always.</p>
              <Link href="/submit-event"><Button variant="gradient">Submit an Event</Button></Link>
            </Reveal>
            <Reveal as="article" delay={120} y={28}>
              <h2>Teach Dance?</h2>
              <p>Get listed where dancers are already looking. They find you; you just show up.</p>
              <Link href="/become-an-instructor"><Button className="drop-button-ghost">Become an Instructor</Button></Link>
            </Reveal>
          </div>
          <div className="drop-foot">
            <span className="drop-sign">see you on the floor.</span>
            <LiveClock />
          </div>
        </div>
      </section>
    </div>
  )
}
