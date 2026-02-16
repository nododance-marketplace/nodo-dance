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

              {/* Google Sign-In */}
              <Button
                variant="outline"
                className="w-full mb-4 flex items-center justify-center gap-3"
                onClick={() => signIn('google', { callbackUrl })}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </Button>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

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
