import Link from 'next/link'
import { Heart, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/reveal'
import { HeroTitle } from '@/components/home/HeroTitle'
import { HeroEmblem } from '@/components/home/HeroEmblem'
import { MagneticLink } from '@/components/home/MagneticLink'
import { EventTicker, type TickerItem } from '@/components/home/EventTicker'
import { LiveClock } from '@/components/home/LiveClock'
import { DANCE_STYLES } from '@/lib/constants'
import { DANCE_STYLE_COLORS } from '@/lib/styleColors'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'
import { formatTime } from '@/lib/utils'
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
  // The cities that actually have something on right now. A city with no
  // events yet is still coming, but it is not somewhere to send a visitor.
  const counts = await prisma.event.groupBy({
    by: ['city'],
    where: { status: 'APPROVED', startDateTime: { gte: new Date() } },
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
    where: { status: 'APPROVED', startDateTime: { gte: new Date() } },
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

  const styles = DANCE_STYLES.filter(s => s !== 'Other')

  return (
    <div>
      <section className="home-hero">
        <div className="home-container">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <HeroTitle />
              <p>Find instructors, discover events, and join your city&apos;s partner dance community.</p>
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
            <div className="home-section-head"><h2>How It Works</h2><p>Get started in three simple steps.</p></div>
          </Reveal>
          <div className="home-steps">
            {[
              { n: '01', title: 'Browse', copy: 'Explore our directory of experienced dance instructors and upcoming events.' },
              { n: '02', title: 'Connect', copy: 'Request lessons with instructors or register for events that interest you.' },
              { n: '03', title: 'Dance', copy: 'Start your dance journey and become part of our vibrant community.' },
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

      <section className="home-section">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head"><h2>Find Your City</h2><p>{totalEvents} upcoming events across {liveMarkets.length} partner dance {liveMarkets.length === 1 ? 'community' : 'communities'}.</p></div>
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
            <div className="home-section-head"><h2>Dance Styles We Love</h2><p>Find instructors and events for your favorite partner dance.</p></div>
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
              <p>Your city&apos;s dance scene, all in one place. Join the community.</p>
            </div>
          </Reveal>
          <div className="drop-grid">
            <Reveal as="article" y={28}>
              <h2>Have an Event?</h2>
              <p>Share your dance social, workshop, or festival with the community. It&apos;s free!</p>
              <Link href="/submit-event"><Button variant="gradient">Submit an Event</Button></Link>
            </Reveal>
            <Reveal as="article" delay={120} y={28}>
              <h2>Teach Dance?</h2>
              <p>Join our directory and connect with students looking for instructors like you.</p>
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
