'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, User, Shield, Search } from 'lucide-react'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CitySwitcher } from '@/components/layout/city-switcher'

/**
 * Meetup-style nav: search up front, one primary action ("Post Event"),
 * everything else quiet. Instructors/Cities/Blog are secondary links.
 */
const SECONDARY_LINKS = [
  { href: '/instructors', label: 'Instructors' },
  { href: '/cities', label: 'Cities' },
  { href: '/blog', label: 'Blog' },
]

/** GET form → /events?search=… The events page reads the search param. */
function NavSearch({ placeholder = 'Search events' }: { placeholder?: string }) {
  return (
    <form action="/events" role="search" className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)] pointer-events-none" />
      <input
        type="search"
        name="search"
        placeholder={placeholder}
        aria-label="Search events"
        className="w-full h-9 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-2)] pl-9 pr-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
      />
    </form>
  )
}

/** Quiet text links for signed-out visitors. */
function AuthLinks({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <Link href="/auth/signin" className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
        Log in
      </Link>
      <span className="text-[var(--color-rule)]" aria-hidden>/</span>
      <Link href="/auth/signin" className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors">
        Sign in
      </Link>
    </span>
  )
}

export function Header() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const userRole = session?.user?.role
  const dashboardUrl = userRole === 'INSTRUCTOR' ? '/instructor/dashboard' : '/account'
  const dashboardLabel = userRole === 'INSTRUCTOR' ? 'Dashboard' : 'My Account'

  return (
    <header className={`site-header sticky top-0 z-50 ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20 gap-3 md:gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center flex-shrink-0" aria-label="Nodo Dance home">
            <Image
              src="/Title-white.png"
              alt="Nodo Dance"
              width={800}
              height={225}
              className="h-8 md:h-10 w-auto"
              priority
            />
          </Link>

          {/* Search + city (move up front, Meetup-style) */}
          <div className="hidden md:flex items-center gap-2 flex-1 justify-center max-w-md">
            <NavSearch />
            <Suspense fallback={<div className="h-9 w-24 flex-shrink-0" />}>
              <CitySwitcher />
            </Suspense>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-5 ml-2">
            <Link href="/events" aria-current={pathname.startsWith('/events') ? 'page' : undefined} className="nav-link">
              Events
            </Link>

            {/* Secondary links */}
            {SECONDARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] whitespace-nowrap transition-colors"
              >
                {link.label}
              </Link>
            ))}

            {/* Primary action */}
            <Link href="/submit-event">
              <Button variant="gradient" size="sm">
                Post Event
              </Button>
            </Link>

            <span className="w-px h-5 bg-[var(--color-rule)]" aria-hidden />

            {!session ? (
              <>
                <Link href="/become-an-instructor" className="nav-link">
                  Become an Instructor
                </Link>
                <AuthLinks />
              </>
            ) : (
              <>
                {userRole !== 'INSTRUCTOR' && (
                  <Link href="/become-an-instructor" className="nav-link">
                    Become an Instructor
                  </Link>
                )}
                <Link
                  href="/manage"
                  aria-current={pathname.startsWith('/manage') ? 'page' : undefined}
                  className="nav-link"
                >
                  Manage Business
                </Link>
                <Link
                  href="/my-tickets"
                  aria-current={pathname.startsWith('/my-tickets') ? 'page' : undefined}
                  className="nav-link"
                >
                  My tickets
                </Link>
                {/* @ts-ignore */}
                {session.user?.isAdmin && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm" className="border-amber-400 text-amber-700 hover:bg-amber-50">
                      <Shield className="w-4 h-4 mr-2" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Link href={dashboardUrl}>
                  <Button variant="outline" size="sm">
                    <User className="w-4 h-4 mr-2" />
                    {dashboardLabel}
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                  Sign Out
                </Button>
              </>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            className="nav-toggle xl:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav
          id="mobile-menu"
          aria-label="Mobile navigation"
          className={`mobile-panel xl:hidden ${mobileMenuOpen ? 'is-open' : ''}`}
        >
          <div className="flex flex-col space-y-1 pb-4">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-[var(--color-muted)]">Browsing city</span>
              <Suspense fallback={null}>
                <CitySwitcher />
              </Suspense>
            </div>

            {/* Search first, Meetup-style */}
            <div className="px-3 py-2">
              <NavSearch placeholder="Search events" />
            </div>

            <div className="mobile-panel-action px-3 pt-2 pb-3" style={{ '--i': 0 } as CSSProperties}>
              <Link href="/submit-event" className="block" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="gradient" size="md" className="w-full">
                  Post Event
                </Button>
              </Link>
            </div>

            <Link
              href="/events"
              aria-current={pathname.startsWith('/events') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 1 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Events
            </Link>

            {/* Secondary links */}
            <p className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-[var(--color-muted)]">Explore</p>
            {SECONDARY_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname.startsWith(link.href) ? 'page' : undefined}
                className="mobile-panel-link text-sm"
                style={{ '--i': i + 2 } as CSSProperties}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            {!session ? (
              <>
                <Link
                  href="/become-an-instructor"
                  className="mobile-panel-link"
                  style={{ '--i': 5 } as CSSProperties}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Become an Instructor
                </Link>
                <div className="mobile-panel-action px-3 py-3 flex items-center gap-4" style={{ '--i': 6 } as CSSProperties}>
                  <AuthLinks className="text-base" />
                </div>
              </>
            ) : (
              <>
                {userRole !== 'INSTRUCTOR' && (
                  <Link
                    href="/become-an-instructor"
                    className="mobile-panel-link"
                    style={{ '--i': 5 } as CSSProperties}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Become an Instructor
                  </Link>
                )}
                <Link
                  href="/manage"
                  aria-current={pathname.startsWith('/manage') ? 'page' : undefined}
                  className="mobile-panel-link"
                  style={{ '--i': 6 } as CSSProperties}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Manage Business
                </Link>
                <Link
                  href="/my-tickets"
                  aria-current={pathname.startsWith('/my-tickets') ? 'page' : undefined}
                  className="mobile-panel-link"
                  style={{ '--i': 7 } as CSSProperties}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  My tickets
                </Link>
                {/* @ts-ignore */}
                {session.user?.isAdmin && (
                  <div className="mobile-panel-action" style={{ '--i': 8 } as CSSProperties}>
                    <Link href="/admin" className="block px-3 py-2">
                      <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-700">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Button>
                    </Link>
                  </div>
                )}
                <div className="mobile-panel-action" style={{ '--i': 9 } as CSSProperties}>
                  <Link href={dashboardUrl} className="block px-3 py-2">
                    <Button variant="outline" size="sm" className="w-full">
                      <User className="w-4 h-4 mr-2" />
                      {dashboardLabel}
                    </Button>
                  </Link>
                </div>
                <div className="mobile-panel-action" style={{ '--i': 10 } as CSSProperties}>
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => signOut()}>
                    Sign Out
                  </Button>
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
