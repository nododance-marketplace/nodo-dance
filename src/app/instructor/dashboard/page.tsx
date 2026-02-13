import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Edit, ExternalLink, LogOut, CheckCircle } from 'lucide-react'
import { SignOutButton } from '@/components/auth/sign-out-button'
import { DangerZone } from '@/components/auth/danger-zone'

export const dynamic = 'force-dynamic'

export default async function InstructorDashboardPage() {
  // Auth check - redirect if not logged in
  const session = await getServerSession(authOptions)

  console.log('🔍 [Dashboard] Session check:', {
    hasSession: !!session,
    userEmail: session?.user?.email,
    timestamp: new Date().toISOString(),
  })

  if (!session?.user?.email) {
    console.log('⚠️ [Dashboard] No session, redirecting to sign in')
    redirect('/auth/signin?callbackUrl=/instructor/dashboard')
  }

  // Fetch user and profile
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { instructorProfile: true },
  })

  if (!user) {
    console.log('⚠️ [Dashboard] User not found in database')
    redirect('/auth/signin')
  }

  const profile = user.instructorProfile
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Instructor Dashboard</h1>
        <SignOutButton />
      </div>

      {/* Debug Session Info (Development Only) */}
      {isDev && (
        <Card className="mb-6 bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 mb-2">✅ Signed In Successfully</h3>
                <div className="text-sm text-green-800 space-y-1">
                  <p><strong>Email:</strong> {session.user.email}</p>
                  <p><strong>User ID:</strong> {user.id}</p>
                  <p><strong>Role:</strong> {user.role}</p>
                  <p className="text-xs text-green-600 mt-2">
                    (This debug info only shows in development)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">
                {profile ? profile.displayName : 'Your Instructor Profile'}
              </h2>
              {profile && (
                <div className="flex items-center gap-2">
                  <Badge variant={profile.isPublished ? 'success' : 'warning'}>
                    {profile.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/instructor/profile/edit">
              <Button variant="gradient" size="lg">
                <Edit className="w-4 h-4 mr-2" />
                {profile ? 'Edit Profile' : 'Create Profile'}
              </Button>
            </Link>

            {profile && profile.isPublished && (
              <Link href={`/instructors/${profile.slug}`} target="_blank">
                <Button variant="outline" size="lg">
                  <Eye className="w-4 h-4 mr-2" />
                  View Public Profile
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            )}
          </div>

          {!profile && (
            <p className="text-gray-600 mt-4">
              Create your instructor profile to appear in the directory and receive lesson requests.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <DangerZone />
    </div>
  )
}
