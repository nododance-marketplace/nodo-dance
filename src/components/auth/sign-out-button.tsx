'use client'

import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        console.log('🚪 [SignOut] Signing out...')
        signOut({ callbackUrl: '/auth/signin' })
      }}
    >
      <LogOut className="w-4 h-4 mr-2" />
      Sign Out
    </Button>
  )
}
