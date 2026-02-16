import Link from 'next/link'
import Image from 'next/image'
import { Instagram, Mail } from 'lucide-react'

export function Footer() {
  const city = process.env.NEXT_PUBLIC_CITY || 'Charlotte, NC'

  return (
    <footer className="bg-primary text-white mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
            <p className="text-gray-300 mb-4">
              {city}&apos;s hub for partner dance instructors and events.
            </p>
            <div className="flex space-x-4">
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:text-accent-coral transition-colors">
                <Instagram className="w-6 h-6" />
              </a>
              <a href="mailto:hello@nododance.com" className="hover:text-accent-coral transition-colors">
                <Mail className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/instructors" className="text-gray-300 hover:text-white transition-colors">
                  Find Instructors
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-gray-300 hover:text-white transition-colors">
                  Browse Events
                </Link>
              </li>
              <li>
                <Link href="/submit-event" className="text-gray-300 hover:text-white transition-colors">
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
                <Link href="/become-an-instructor" className="text-gray-300 hover:text-white transition-colors">
                  Join as Instructor
                </Link>
              </li>
              <li>
                <Link href="/auth/signin" className="text-gray-300 hover:text-white transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
          <p>&copy; {new Date().getFullYear()} Nodo Dance. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
