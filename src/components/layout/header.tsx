'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, User, Shield } from 'lucide-react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function Header() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const userRole = session?.user?.role
  const dashboardUrl = userRole === 'INSTRUCTOR' ? '/instructor/dashboard' : '/account'
  const dashboardLabel = userRole === 'INSTRUCTOR' ? 'Dashboard' : 'My Account'

  return (
    <header className="site-header sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center mr-8 flex-shrink-0">
            <Image
              src="/Title.png"
              alt="Nodo Dance"
              width={800}
              height={225}
              className="h-8 md:h-10 w-auto"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-5">
            <Link href="/instructors" aria-current={pathname.startsWith('/instructors') ? 'page' : undefined} className="text-gray-700 hover:text-primary transition-colors">
              Instructors
            </Link>
            <Link href="/events" aria-current={pathname.startsWith('/events') ? 'page' : undefined} className="text-gray-700 hover:text-primary transition-colors">
              Events
            </Link>
            <Link href="/submit-event" aria-current={pathname.startsWith('/submit-event') ? 'page' : undefined} className="text-gray-700 hover:text-primary transition-colors">
              Submit Event
            </Link>
            <Link href="/launch" aria-current={pathname.startsWith('/launch') ? 'page' : undefined} className="text-gray-700 hover:text-primary transition-colors">
              Websites
            </Link>
            {!session ? (
              <>
                <Link href="/become-an-instructor" className="text-gray-700 hover:text-primary transition-colors">
                  Become an Instructor
                </Link>
                <Link href="/auth/signin">
                  <Button size="sm">Sign In</Button>
                </Link>
              </>
            ) : (
              <>
                {userRole !== 'INSTRUCTOR' && (
                  <Link href="/become-an-instructor" className="text-gray-700 hover:text-primary transition-colors">
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
            className="xl:hidden p-3"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav id="mobile-menu" aria-label="Mobile navigation" className="xl:hidden py-4 border-t border-gray-200 max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <div className="flex flex-col space-y-3">
              <Link
                href="/instructors" aria-current={pathname.startsWith('/instructors') ? 'page' : undefined}
                className="text-gray-700 hover:text-primary transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Instructors
              </Link>
              <Link
                href="/events" aria-current={pathname.startsWith('/events') ? 'page' : undefined}
                className="text-gray-700 hover:text-primary transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Events
              </Link>
              <Link
                href="/submit-event" aria-current={pathname.startsWith('/submit-event') ? 'page' : undefined}
                className="text-gray-700 hover:text-primary transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Submit Event
              </Link>
              <Link
                href="/launch" aria-current={pathname.startsWith('/launch') ? 'page' : undefined}
                className="text-gray-700 hover:text-primary transition-colors py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                Websites
              </Link>
              {!session ? (
                <>
                  <Link
                    href="/become-an-instructor"
                    className="text-gray-700 hover:text-primary transition-colors py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Become an Instructor
                  </Link>
                  <Link href="/auth/signin" onClick={() => setMobileMenuOpen(false)}>
                    <Button size="sm" className="w-full">Sign In</Button>
                  </Link>
                </>
              ) : (
                <>
                  {userRole !== 'INSTRUCTOR' && (
                    <Link
                      href="/become-an-instructor"
                      className="text-gray-700 hover:text-primary transition-colors py-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Become an Instructor
                    </Link>
                  )}
                  {/* @ts-ignore */}
                  {session.user?.isAdmin && (
                    <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-700">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Panel
                      </Button>
                    </Link>
                  )}
                  <Link href={dashboardUrl} onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full">
                      {dashboardLabel}
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => signOut()}>
                    Sign Out
                  </Button>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}
