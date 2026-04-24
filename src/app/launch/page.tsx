'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Plus,
  AppWindow,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ============================================================================
// CONFIG — change this to your Calendly link
// ============================================================================
const CALENDLY_URL = 'https://calendly.com/nododance/30min'
const CONTACT_EMAIL = 'nododance@gmail.com'

// ============================================================================
// DATA
// ============================================================================
const ADD_ONS: { name: string; price: string }[] = [
  { name: 'Extra landing page section', price: '+$75' },
  { name: 'AI chatbot integration', price: '+$299' },
  { name: 'Stripe payment integration', price: '+$199' },
  { name: 'Calendly/booking integration', price: '+$49' },
  { name: 'Copywriting (I write your content)', price: '+$99' },
  { name: 'Logo creation', price: '+$99' },
  { name: 'Rush delivery (12-hour turnaround)', price: '+$99' },
  { name: 'Extra revision round', price: '+$49' },
]

const CARE_PLAN_FEATURES: string[] = [
  'Hosting + SSL certificate + daily backups',
  'Up to 30 minutes of edits per month',
  'Uptime monitoring',
  'Monthly visitor report',
  'Priority 24-hour support',
]

const STEPS: { num: string; title: string; body: string }[] = [
  {
    num: '01',
    title: 'Book & Pay',
    body:
      'Choose your package, pay securely. Your production slot is locked in the moment payment clears.',
  },
  {
    num: '02',
    title: 'Share Your Brief',
    body:
      'Complete a 5-minute intake form. Your business info, brand colors, and the action you want visitors to take.',
  },
  {
    num: '03',
    title: 'Review & Launch',
    body:
      'Receive your project in 24 hours. One revision round included, then we ship it live.',
  },
]

const FAQS: { q: string; a: string }[] = [
  {
    q: "What if I don't like the first draft?",
    a: 'One round of revisions is included with every package. You review, send feedback, and we refine before going live. Need more? Extra revision rounds are available as an add-on for $49.',
  },
  {
    q: 'Who owns the website?',
    a: 'You do, 100%. Full ownership of the code, the design, and the assets. No lock-in, no licensing fees, no hidden rights.',
  },
  {
    q: 'What if my project is more complex than a landing page?',
    a: "Book a call — we'll scope a custom quote. The productized package is for straightforward launches. Anything larger is handled as a custom engagement.",
  },
  {
    q: 'Can I cancel the Care Plan anytime?',
    a: 'Yes, the Care Plan is monthly with no contract. Cancel anytime and keep your site — you own it.',
  },
  {
    q: 'What do you need from me to start?',
    a: 'Your business info, brand colors, your logo (if you have one), and what action you want visitors to take (book a call, buy, sign up, etc.). A 5-minute intake form covers everything.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'Full refund before work begins. Once production starts, refunds are partial — you only pay for the work completed up to that point.',
  },
]

type WorkItem = {
  name: string
  danceGenre: string
  description: string
  video: string
  poster: string
  url: string
}

const WORK: WorkItem[] = [
  {
    name: 'Kizomba Paixão',
    danceGenre: 'Kizomba',
    description:
      'Landing page for a Charlotte-based kizomba dance community.',
    video: '/work/kizombapaixao.mp4',
    poster: '/work/kizombapaixao.jpg',
    url: 'https://kizombapaixao.vercel.app/',
  },
]

// ============================================================================
// HELPERS
// ============================================================================

/** Scroll-triggered fade + translate reveal (fires once). */
function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          obs.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** Gradient text accent (sunset: coral → magenta → orange). */
function GradientText({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={`bg-gradient-to-r from-accent-coral via-accent-magenta to-accent-orange bg-clip-text text-transparent ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * LazyVideo — performant video card.
 *  - Renders <video> with preload="none" and NO src on mount → 0 bytes fetched initially
 *  - Poster shows instantly
 *  - IntersectionObserver with rootMargin: "200px" sets src + plays on enter, pauses on exit
 *  - Preserves playback position across re-entries (never clears src)
 *  - iOS compatibility: playsInline + webkit-playsinline
 */
function LazyVideo({
  src,
  poster,
  className = '',
}: {
  src: string
  poster: string
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Set src lazily the first time the video enters viewport
          if (!v.src) v.src = src
          // play() may reject on user gesture policies — swallow
          v.play().catch(() => {})
        } else {
          v.pause()
          // Intentionally do NOT unset src, so the video resumes cleanly if user scrolls back
        }
      },
      { rootMargin: '200px' }
    )

    obs.observe(v)
    return () => obs.disconnect()
  }, [src])

  return (
    <video
      ref={ref}
      poster={poster}
      preload="none"
      loop
      muted
      playsInline
      // iOS Safari legacy — React passes unknown attrs through
      {...({ 'webkit-playsinline': 'true' } as Record<string, string>)}
      className={`w-full h-full object-cover ${className}`}
    />
  )
}

/** Single FAQ accordion row. Grid-rows trick gives smooth height animation to auto. */
function FAQItem({
  q,
  a,
  isOpen,
  onToggle,
}: {
  q: string
  a: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
        aria-expanded={isOpen}
      >
        <span className="text-base md:text-lg font-medium text-primary">
          {q}
        </span>
        <Plus
          className={`w-5 h-5 flex-shrink-0 text-primary transition-transform duration-300 ease-out ${
            isOpen ? 'rotate-45' : 'rotate-0'
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          isOpen
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pr-8 text-gray-600 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  )
}

/** Smooth scroll to an element by id (client-side, avoids global CSS). */
function scrollToId(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault()
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ============================================================================
// PAGE
// ============================================================================
export default function LaunchPage() {
  // First FAQ open by default; only one open at a time
  const [openFaq, setOpenFaq] = useState<number>(0)

  return (
    <div className="bg-white text-primary">
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 left-1/4 w-[560px] h-[560px] rounded-full bg-accent-coral/15 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[520px] h-[520px] rounded-full bg-accent-magenta/15 blur-3xl" />
          <div className="absolute top-40 right-10 w-[340px] h-[340px] rounded-full bg-accent-orange/10 blur-3xl" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
          <Reveal>
            <div className="text-center max-w-4xl mx-auto">
              <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                24-Hour Launch Service
              </span>
              <h1 className="mt-5 text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
                Your Landing Page.
                <br className="hidden sm:block" />{' '}
                <GradientText>Live in 24 Hours.</GradientText>
              </h1>
              <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
                Professional landing pages from $249. No agencies. No 6-week
                timelines. No surprises.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="#offer" onClick={scrollToId('offer')}>
                  <Button variant="gradient" size="lg" className="w-full sm:w-auto">
                    Start My Project
                  </Button>
                </a>
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Book a 15-min Call
                  </Button>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── Offer ───────────────────────── */}
      <section
        id="offer"
        className="border-t border-gray-200 py-24 md:py-32 bg-background"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="max-w-[560px] mx-auto">
              <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm p-8 md:p-10">
                {/* Corner tag */}
                <span className="absolute top-4 right-4 text-[10px] uppercase tracking-widest font-semibold text-accent-magenta bg-accent-magenta/10 rounded-full px-3 py-1">
                  Productized Service
                </span>

                {/* Icon */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-coral to-accent-magenta flex items-center justify-center text-white mb-6">
                  <AppWindow className="w-7 h-7" />
                </div>

                {/* Title */}
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Landing Page Launch
                </h2>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-3 flex-wrap">
                  <span className="text-6xl md:text-7xl font-bold leading-none">
                    <GradientText>$249</GradientText>
                  </span>
                  <span className="text-sm text-gray-500">
                    + $19/mo Care Plan (optional)
                  </span>
                </div>

                <div className="my-8 border-t border-gray-200" />

                {/* Bullets */}
                <ul className="space-y-3">
                  {[
                    'One high-converting landing page',
                    'Custom design matched to your brand',
                    'Mobile responsive',
                    'Contact form that emails you leads',
                    'Hosting & domain setup included',
                    'Live in 24 hours',
                  ].map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-accent-coral/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-accent-coral" />
                      </span>
                      <span className="text-gray-700">{b}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-8"
                >
                  <Button variant="gradient" size="lg" className="w-full">
                    Start My Landing Page
                  </Button>
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── Add-Ons ───────────────────────── */}
      <section className="border-t border-gray-200 py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                Add-Ons
              </span>
              <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
                Need More? Add-Ons Available.
              </h2>
              <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                Layer on exactly what your launch needs — nothing you don&apos;t.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ADD_ONS.map((item, i) => (
              <Reveal key={item.name} delay={i * 60}>
                <div className="h-full bg-white rounded-xl border border-gray-200 p-5 hover:border-accent-magenta/40 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-gray-400 tracking-widest">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <p className="mt-2 font-medium text-primary">
                        {item.name}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-accent-magenta bg-accent-magenta/10 rounded px-2 py-1 whitespace-nowrap">
                      {item.price}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── Care Plan ───────────────────────── */}
      <section className="border-t border-gray-200 py-24 md:py-32 bg-background">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Left column */}
            <Reveal>
              <div>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-magenta to-accent-orange flex items-center justify-center text-white mb-6">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                  Optional Care Plan
                </span>
                <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight leading-tight">
                  Keep Your Site Running —{' '}
                  <GradientText>$19/month</GradientText>
                </h2>
                <p className="mt-5 text-lg text-gray-600 max-w-lg">
                  Optional monthly plan to keep your website maintained, backed
                  up, and updated.
                </p>
                <p className="mt-4 text-sm text-gray-500">
                  Cancel anytime. No contracts.
                </p>
              </div>
            </Reveal>

            {/* Right column */}
            <div className="space-y-3">
              {CARE_PLAN_FEATURES.map((feat, i) => (
                <Reveal key={feat} delay={i * 80}>
                  <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4">
                    <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-coral/15 to-accent-magenta/15 flex items-center justify-center flex-shrink-0">
                      <Check className="w-5 h-5 text-accent-magenta" />
                    </span>
                    <span className="text-gray-700">{feat}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── How It Works ───────────────────────── */}
      <section className="border-t border-gray-200 py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-16">
              <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                How It Works
              </span>
              <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
                From brief to launch in three steps.
              </h2>
            </div>
          </Reveal>

          <div className="relative grid md:grid-cols-3 gap-10 md:gap-8">
            {/* Desktop connector line */}
            <div
              aria-hidden
              className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"
            />

            {STEPS.map((s, i) => (
              <Reveal key={s.num} delay={i * 120}>
                <div className="relative text-center md:text-left">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 border-accent-magenta/30 text-accent-magenta font-bold text-lg mb-5 relative z-10">
                    {s.num}
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {s.num} · {s.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── FAQ ───────────────────────── */}
      <section className="border-t border-gray-200 py-24 md:py-32 bg-background">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-20">
            {/* Sticky intro */}
            <div>
              <div className="lg:sticky lg:top-24">
                <Reveal>
                  <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                    FAQ
                  </span>
                  <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
                    Answers before you ask.
                  </h2>
                  <p className="mt-5 text-gray-600 leading-relaxed max-w-md">
                    If something isn&apos;t covered here, book a 15-minute call
                    and we&apos;ll walk through it directly.
                  </p>
                  <a
                    href={CALENDLY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-6"
                  >
                    <Button variant="outline">Book a 15-min Call</Button>
                  </a>
                </Reveal>
              </div>
            </div>

            {/* Accordion */}
            <Reveal>
              <div className="bg-white rounded-2xl border border-gray-200 px-6 md:px-8">
                {FAQS.map((item, i) => (
                  <FAQItem
                    key={item.q}
                    q={item.q}
                    a={item.a}
                    isOpen={openFaq === i}
                    onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
                  />
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ───────────────────────── Recent Work ───────────────────────── */}
      <section className="border-t border-gray-200 py-24 md:py-32">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-14">
              <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                Recent Work
              </span>
              <h2 className="mt-4 text-3xl md:text-5xl font-bold tracking-tight">
                Real Projects. Real Results.
              </h2>
              <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
                A selection of landing pages built for clients across industries.
              </p>
            </div>
          </Reveal>

          <div
            className={`grid gap-6 md:gap-8 ${
              WORK.length === 1
                ? 'md:max-w-2xl md:mx-auto'
                : 'md:grid-cols-2'
            }`}
          >
            {WORK.map((item, i) => (
              <Reveal key={item.url + i} delay={i * 100}>
                <article className="group bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                  {/* 16:10 video frame */}
                  <div className="relative w-full aspect-[16/10] bg-gray-100 overflow-hidden">
                    <LazyVideo
                      src={item.video}
                      poster={item.poster}
                      className="absolute inset-0"
                    />
                  </div>

                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-lg font-bold">{item.name}</h3>
                      <span className="text-[10px] uppercase tracking-widest font-semibold text-accent-magenta bg-accent-magenta/10 rounded-full px-2.5 py-1 whitespace-nowrap">
                        {item.danceGenre}
                      </span>
                    </div>
                    <p className="text-gray-600 mb-4">{item.description}</p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent-magenta font-medium group/link"
                    >
                      View Live Site
                      <ArrowUpRight className="w-4 h-4 transition-transform duration-200 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
                    </a>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── Final CTA ───────────────────────── */}
      <section className="relative border-t border-gray-200 py-24 md:py-32 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-accent-magenta/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-accent-coral/10 blur-3xl" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-3xl mx-auto">
              <span className="inline-block uppercase tracking-[0.2em] text-xs font-semibold text-accent-magenta">
                Launch Day
              </span>
              <h2 className="mt-4 text-4xl md:text-6xl font-bold tracking-tight">
                Ready to <GradientText>Launch?</GradientText>
              </h2>
              <p className="mt-6 text-lg md:text-xl text-gray-600">
                Pick a package, share your brief, and have your landing page
                live within 24 hours — not weeks.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="#offer" onClick={scrollToId('offer')}>
                  <Button variant="gradient" size="lg" className="w-full sm:w-auto">
                    Start My Project
                  </Button>
                </a>
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    Book a 15-min Call
                  </Button>
                </a>
              </div>
              <p className="mt-6 text-sm text-gray-500">
                24-hour delivery · Full ownership · No contracts.
              </p>
              <p className="mt-3 text-sm text-gray-500">
                Prefer email? Reach us at{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="font-medium text-accent-magenta hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
