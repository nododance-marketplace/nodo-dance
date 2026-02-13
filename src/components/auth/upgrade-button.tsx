'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { GraduationCap } from 'lucide-react'

export function UpgradeButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    const upgradeToast = toast.loading('Upgrading your account...')

    try {
      const res = await fetch('/api/user/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'INSTRUCTOR' }),
      })

      if (!res.ok) throw new Error('Failed to upgrade')

      toast.success('Account upgraded to Instructor!', { id: upgradeToast })
      router.push('/instructor/dashboard')
      router.refresh()
    } catch {
      toast.error('Failed to upgrade. Please try again.', { id: upgradeToast })
      setLoading(false)
    }
  }

  return (
    <Button variant="gradient" size="lg" onClick={handleUpgrade} disabled={loading}>
      <GraduationCap className="w-5 h-5 mr-2" />
      {loading ? 'Upgrading...' : 'Upgrade to Instructor'}
    </Button>
  )
}
