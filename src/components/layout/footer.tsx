import Link from 'next/link'
import Image from 'next/image'
import { Instagram, Mail } from 'lucide-react'

export function Footer() {
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'

  return (
    <footer className="site-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="mb-4">
              <Image
                src="/Title-white.png"
                alt="Nodo Dance"
                width={800}
                height={225}
                className="h-10 w-auto"
              />
            </div>
            <p className="text-[var(--color-on-dark-muted)] mb-4">
              {city}&apos;s hub for partner dance instructors and events.
            </p>
            <div className="flex space-x-2">
              <a aria-label="Nodo Dance on Instagram" href="https://www.instagram.com/nododance/" target="_blank" rel="noopener noreferrer" className="footer-social text-[var(--color-on-dark-muted)]">
                <Instagram className="w-6 h-6" />
              </a>
              <a aria-label="Email Nodo Dance" href="mailto:nododance@gmail.com" className="footer-social text-[var(--color-on-dark-muted)]">
                <Mail className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/instructors" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Find Instructors
                </Link>
              </li>
              <li>
                <Link href="/events" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Browse Events
                </Link>
              </li>
              <li>
                <Link href="/submit-event" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Submit an Event
                </Link>
              </li>
            </ul>
          </div>

          {/* For Instructors */}
          <div>
            <h3 className="font-semibold mb-4">For Instructors</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/become-an-instructor" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Join as Instructor
                </Link>
              </li>
              <li>
                <Link href="/auth/signin" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="footer-link text-[var(--color-on-dark-muted)] hover:text-white">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[var(--color-dark-rule)] mt-8 pt-8 text-[var(--color-on-dark-muted)] text-sm">
          <p>&copy; {new Date().getFullYear()} Nodo Dance. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
