'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, User, Shield } from 'lucide-react'
import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CitySwitcher } from '@/components/layout/city-switcher'

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
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center mr-4 md:mr-6 flex-shrink-0" aria-label="Nodo Dance home">
            <Image
              src="/Title-white.png"
              alt="Nodo Dance"
              width={800}
              height={225}
              className="h-8 md:h-10 w-auto"
              priority
            />
          </Link>

          {/* City switcher */}
          <Suspense fallback={<div className="h-9 w-24" />}>
            <CitySwitcher />
          </Suspense>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-7 ml-8">
            <Link href="/instructors" aria-current={pathname.startsWith('/instructors') ? 'page' : undefined} className="nav-link">
              Instructors
            </Link>
            <Link href="/events" aria-current={pathname.startsWith('/events') ? 'page' : undefined} className="nav-link">
              Events
            </Link>
            <Link href="/cities" aria-current={pathname.startsWith('/cities') ? 'page' : undefined} className="nav-link">
              Cities
            </Link>
            <Link href="/submit-event" aria-current={pathname.startsWith('/submit-event') ? 'page' : undefined} className="nav-link">
              Submit Event
            </Link>
            <Link href="/launch" aria-current={pathname.startsWith('/launch') ? 'page' : undefined} className="nav-link">
              Websites
            </Link>
            {!session ? (
              <>
                <Link href="/become-an-instructor" className="nav-link">
                  Become an Instructor
                </Link>
                <Link href="/auth/signin">
                  <Button size="sm">Sign In</Button>
                </Link>
              </>
            ) : (
              <>
                {userRole !== 'INSTRUCTOR' && (
                  <Link href="/become-an-instructor" className="nav-link">
                    Become an Instructor
                  </Link>
                )}
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
              <span className="text-sm text-gray-500">Browsing city</span>
              <Suspense fallback={null}>
                <CitySwitcher />
              </Suspense>
            </div>
            <Link
              href="/instructors" aria-current={pathname.startsWith('/instructors') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 0 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Instructors
            </Link>
            <Link
              href="/events" aria-current={pathname.startsWith('/events') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 1 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Events
            </Link>
            <Link
              href="/cities" aria-current={pathname.startsWith('/cities') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 2 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Cities
            </Link>
            <Link
              href="/submit-event" aria-current={pathname.startsWith('/submit-event') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 3 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Submit Event
            </Link>
            <Link
              href="/launch" aria-current={pathname.startsWith('/launch') ? 'page' : undefined}
              className="mobile-panel-link"
              style={{ '--i': 4 } as CSSProperties}
              onClick={() => setMobileMenuOpen(false)}
            >
              Websites
            </Link>
            {!session ? (
              <>
                <Link
                  href="/become-an-instructor"
                  className="mobile-panel-link"
                  style={{ '--i': 4 } as CSSProperties}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Become an Instructor
                </Link>
                <div className="mobile-panel-action" style={{ '--i': 5 } as CSSProperties}>
                  <Link href="/auth/signin">
                    <Button size="sm" className="w-full">Sign In</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                {userRole !== 'INSTRUCTOR' && (
                  <Link
                    href="/become-an-instructor"
                    className="mobile-panel-link"
                    style={{ '--i': 4 } as CSSProperties}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Become an Instructor
                  </Link>
                )}
                {/* @ts-ignore */}
                {session.user?.isAdmin && (
                  <div className="mobile-panel-action" style={{ '--i': 5 } as CSSProperties}>
                    <Link href="/admin" className="block">
                      <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-700">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Button>
                    </Link>
                  </div>
                )}
                <div className="mobile-panel-action" style={{ '--i': 6 } as CSSProperties}>
                  <Link href={dashboardUrl} className="block">
                    <Button variant="outline" size="sm" className="w-full">
                      <User className="w-4 h-4 mr-2" />
                      {dashboardLabel}
                    </Button>
                  </Link>
                </div>
                <div className="mobile-panel-action" style={{ '--i': 7 } as CSSProperties}>
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
