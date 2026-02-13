'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Music, GraduationCap } from 'lucide-react'

export function OnboardingPicker() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function selectRole(role: 'DANCER' | 'INSTRUCTOR') {
    setLoading(role)

    try {
      const res = await fetch('/api/user/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })

      if (!res.ok) throw new Error('Failed to set role')

      if (role === 'INSTRUCTOR') {
        router.push('/instructor/dashboard')
      } else {
        router.push('/account')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-3">
          Welcome to Nodo Dance
        </h1>
        <p className="text-lg text-gray-600 mb-10">
          What brings you here?
        </p>

        <div className="grid sm:grid-cols-2 gap-6">
          <button
            onClick={() => selectRole('DANCER')}
            disabled={loading !== null}
            className="text-left group"
          >
            <Card className={`h-full transition-all hover:shadow-lg hover:border-primary/40 ${loading === 'DANCER' ? 'border-primary ring-2 ring-primary/20' : ''} ${loading && loading !== 'DANCER' ? 'opacity-50' : ''}`}>
              <CardContent className="p-8">
                <Music className="w-12 h-12 text-accent-coral mb-4 group-hover:scale-110 transition-transform" />
                <h2 className="text-xl font-bold mb-2">I&apos;m a Dancer</h2>
                <p className="text-gray-600 text-sm">
                  Find instructors, book lessons, discover events, and connect with the dance community.
                </p>
                {loading === 'DANCER' && (
                  <p className="text-sm text-primary mt-3 font-medium">Setting up...</p>
                )}
              </CardContent>
            </Card>
          </button>

          <button
            onClick={() => selectRole('INSTRUCTOR')}
            disabled={loading !== null}
            className="text-left group"
          >
            <Card className={`h-full transition-all hover:shadow-lg hover:border-primary/40 ${loading === 'INSTRUCTOR' ? 'border-primary ring-2 ring-primary/20' : ''} ${loading && loading !== 'INSTRUCTOR' ? 'opacity-50' : ''}`}>
              <CardContent className="p-8">
                <GraduationCap className="w-12 h-12 text-accent-coral mb-4 group-hover:scale-110 transition-transform" />
                <h2 className="text-xl font-bold mb-2">I&apos;m an Instructor</h2>
                <p className="text-gray-600 text-sm">
                  Create your profile, receive lesson requests, and grow your dance teaching business.
                </p>
                {loading === 'INSTRUCTOR' && (
                  <p className="text-sm text-primary mt-3 font-medium">Setting up...</p>
                )}
              </CardContent>
            </Card>
          </button>
        </div>

        <p className="text-sm text-gray-400 mt-8">
          You can always change this later from your account settings.
        </p>
      </div>
    </div>
  )
}
