'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Mail } from 'lucide-react'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <SignInContent />
    </Suspense>
  )
}

function SignInContent() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const callbackUrl = searchParams.get('callbackUrl') || '/instructor/dashboard'

  // Debug: Log session status on mount
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [SignIn Page] Status:', status, 'Has session:', !!session)
      console.log('🔍 [SignIn Page] Callback URL:', callbackUrl)
    }
  }, [status, session, callbackUrl])

  // If already signed in, redirect to callback URL
  useEffect(() => {
    if (status === 'authenticated' && session) {
      console.log('✅ [SignIn Page] Already authenticated, redirecting to:', callbackUrl)
      router.push(callbackUrl)
    }
  }, [status, session, callbackUrl, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      console.log('📧 [SignIn] Sending magic link to:', email)
      const result = await signIn('email', {
        email,
        redirect: false,
        callbackUrl,
      })
      console.log('📧 [SignIn] Magic link sent, result:', result)
      setSent(true)
    } catch (error) {
      console.error('❌ [SignIn] Error:', error)
      alert('Failed to send magic link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8">
          {sent ? (
            <div className="text-center">
              <Mail className="w-16 h-16 text-accent-coral mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-4">Check Your Email</h1>
              <p className="text-gray-600">
                We&apos;ve sent you a magic link to <strong>{email}</strong>.
                Click the link in the email to sign in.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-6 text-center">Sign In to Nodo Dance</h1>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email Address</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading} variant="gradient" className="w-full">
                  {loading ? 'Sending...' : 'Send Magic Link'}
                </Button>
              </form>
              <p className="text-sm text-gray-500 mt-4 text-center">
                We&apos;ll send you a passwordless sign-in link
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
