'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserPlus } from 'lucide-react'

export function LoginPromptCard() {
  const pathname = usePathname()
  const callbackUrl = encodeURIComponent(pathname)

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-accent-coral/5 border-primary/20">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-primary mb-2">Create a free account to:</h3>
            <ul className="text-sm text-gray-700 space-y-1 mb-4">
              <li>Request lessons from instructors</li>
              <li>Save favorite instructors</li>
              <li>Get event notifications</li>
              <li>Access exclusive discounts</li>
            </ul>
            <Link href={`/auth/signin?callbackUrl=${callbackUrl}`}>
              <Button variant="gradient" size="sm">
                Create Free Account
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
