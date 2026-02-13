'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, Calendar, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/instructors', label: 'Instructors', icon: Users },
    { href: '/events', label: 'Events', icon: Calendar },
    { href: '/dashboard', label: 'Dashboard', icon: User },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="grid grid-cols-4">
        {links.map((link) => {
          const Icon = link.icon
          const isActive = pathname === link.href

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex flex-col items-center justify-center py-3 transition-colors',
                isActive
                  ? 'text-primary bg-primary/5'
                  : 'text-gray-600 hover:text-primary'
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-xs">{link.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
