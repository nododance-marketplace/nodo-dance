'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SaveButtonProps {
  itemId: string
  type: 'instructor' | 'event'
  initialSaved?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function SaveButton({ itemId, type, initialSaved = false, size = 'md', className }: SaveButtonProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [saved, setSaved] = useState(initialSaved)
  const [loading, setLoading] = useState(false)

  // Fetch saved status on mount if logged in
  useEffect(() => {
    if (!session?.user) return

    const paramKey = type === 'instructor' ? 'instructorId' : 'eventId'
    fetch(`/api/saved/${type}?${paramKey}=${itemId}`)
      .then((res) => res.json())
      .then((data) => setSaved(data.saved))
      .catch(() => {})
  }, [session, itemId, type])

  if (!session?.user) {
    const callbackUrl = encodeURIComponent(pathname)
    return (
      <Link href={`/auth/signin?callbackUrl=${callbackUrl}`}>
        <button
          className={cn(
            'flex items-center gap-1 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-accent-coral hover:border-accent-coral/30 transition-colors',
            size === 'sm' ? 'p-1.5' : 'px-3 py-2 text-sm',
            className
          )}
          title={`Sign in to save this ${type}`}
        >
          <Heart className={size === 'sm' ? 'w-4 h-4' : 'w-4 h-4'} />
          {size === 'md' && <span>Save</span>}
        </button>
      </Link>
    )
  }

  async function toggleSave() {
    setLoading(true)
    const prev = saved

    // Optimistic update
    setSaved(!prev)

    try {
      const bodyKey = type === 'instructor' ? 'instructorId' : 'eventId'
      const res = await fetch(`/api/saved/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [bodyKey]: itemId }),
      })

      if (!res.ok) throw new Error('Failed to save')

      const data = await res.json()
      setSaved(data.saved)
      toast.success(data.saved ? 'Saved!' : 'Removed from saved')
    } catch {
      setSaved(prev)
      toast.error('Failed to save. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggleSave}
      disabled={loading}
      className={cn(
        'flex items-center gap-1 rounded-lg border transition-colors',
        saved
          ? 'border-accent-coral/30 bg-accent-coral/5 text-accent-coral'
          : 'border-gray-200 bg-white text-gray-500 hover:text-accent-coral hover:border-accent-coral/30',
        size === 'sm' ? 'p-1.5' : 'px-3 py-2 text-sm',
        loading && 'opacity-50 cursor-not-allowed',
        className
      )}
      title={saved ? `Unsave this ${type}` : `Save this ${type}`}
    >
      <Heart className={cn(size === 'sm' ? 'w-4 h-4' : 'w-4 h-4', saved && 'fill-current')} />
      {size === 'md' && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  )
}
