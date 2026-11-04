import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/reveal'
import { Heart, MapPin } from 'lucide-react'
import { DANCE_STYLES } from '@/lib/constants'
import { DANCE_STYLE_COLORS } from '@/lib/styleColors'
import type { CSSProperties } from 'react'

export default function HomePage() {
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'
  const marqueeStyles = DANCE_STYLES.filter(s => s !== 'Other')

  return (
    <div>
      <section className="home-hero">
        <div className="home-container">
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <h1>Find your<br />next dance.</h1>
              <p>Find instructors, discover events, and join {city}&apos;s partner dance community.</p>
              <div className="home-actions">
                <Link href="/events"><Button variant="gradient" size="lg">Explore Events</Button></Link>
                <Link href="/instructors"><Button variant="outline" size="lg">Find Instructors</Button></Link>
              </div>
            </div>
            <div className="community-visual">
              <div className="community-symbol">
                <Image src="/emblem.png" alt="Nodo's connected partner dancers" width={2000} height={2000} priority />
              </div>
              <div className="community-styles" aria-label="Partner dance communities">
                {['Salsa', 'Bachata', 'Kizomba', 'West Coast Swing', 'Tango', 'Zouk'].map(style => (
                  <span key={style} style={{ '--style-color': DANCE_STYLE_COLORS[style] } as CSSProperties}>{style}</span>
                ))}
              </div>
              <p className="community-caption">Connecting the Dance Community.</p>
            </div>
          </div>
          <div className="home-location"><MapPin className="h-4 w-4" aria-hidden="true" /><span>Rooted in {city}</span></div>
        </div>
      </section>

      <section className="style-marquee" aria-hidden="true">
        <div className="style-marquee-track">
          {[0, 1].map(track =>
            marqueeStyles.map(style => (
              <span key={`${track}-${style}`} className="style-marquee-item">{style}</span>
            ))
          )}
        </div>
      </section>

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

      <section className="home-section home-styles">
        <div className="home-container">
          <Reveal>
            <div className="home-section-head"><h2>Dance Styles We Love</h2><p>Find instructors and events for your favorite partner dance.</p></div>
          </Reveal>
          <div className="style-index">
            {DANCE_STYLES.filter(s => s !== 'Other').map((style, i) => (
              <Reveal key={style} className="style-index-item" delay={(i % 3) * 90} y={20} style={{ '--style-color': DANCE_STYLE_COLORS[style] } as CSSProperties}>
                <h3>{style}</h3>
                <Heart className="h-5 w-5" aria-hidden="true" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-container home-contribute">
          <Reveal as="article" y={28}>
            <h2>Have an Event?</h2>
            <p>Share your dance social, workshop, or festival with the community. It&apos;s free!</p>
            <Link href="/submit-event"><Button variant="gradient">Submit an Event</Button></Link>
          </Reveal>
          <Reveal as="article" delay={120} y={28}>
            <h2>Teach Dance?</h2>
            <p>Join our directory and connect with students looking for instructors like you.</p>
            <Link href="/become-an-instructor"><Button variant="outline">Become an Instructor</Button></Link>
          </Reveal>
        </div>
      </section>

      <section className="home-community home-container">
        <Reveal>
          <h2>Proudly Serving {city}</h2>
          <p>Your city&apos;s dance scene, all in one place. Join the community.</p>
        </Reveal>
      </section>
    </div>
  )
}
