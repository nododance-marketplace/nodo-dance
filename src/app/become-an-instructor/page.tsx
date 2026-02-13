import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, DollarSign, Calendar, Heart } from 'lucide-react'
import { UpgradeButton } from '@/components/auth/upgrade-button'

export const dynamic = 'force-dynamic'

export default async function BecomeInstructorPage() {
  const session = await getServerSession(authOptions)

  // If logged in as INSTRUCTOR already, go straight to dashboard
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { role: true },
    })
    if (user?.role === 'INSTRUCTOR') {
      redirect('/instructor/dashboard')
    }
  }

  const isLoggedIn = !!session?.user?.email

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
          Become an Instructor
        </h1>
        <p className="text-xl text-gray-600">
          Connect with students and grow your dance business
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-12">
        <Card>
          <CardContent className="p-6">
            <Users className="w-12 h-12 text-accent-coral mb-4" />
            <h3 className="text-xl font-semibold mb-2">Reach More Students</h3>
            <p className="text-gray-600">
              Get discovered by students actively looking for dance instructors in Charlotte
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <DollarSign className="w-12 h-12 text-accent-coral mb-4" />
            <h3 className="text-xl font-semibold mb-2">100% Free</h3>
            <p className="text-gray-600">
              Create your profile, receive lesson requests, and keep all your earnings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <Calendar className="w-12 h-12 text-accent-coral mb-4" />
            <h3 className="text-xl font-semibold mb-2">Manage Your Schedule</h3>
            <p className="text-gray-600">
              Work on your own terms. Accept requests that fit your availability
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <Heart className="w-12 h-12 text-accent-coral mb-4" />
            <h3 className="text-xl font-semibold mb-2">Support the Community</h3>
            <p className="text-gray-600">
              Help grow Charlotte&apos;s partner dance scene and share your passion
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-primary to-primary-light text-white">
        <CardContent className="p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl mb-6 text-gray-200">
            Create your instructor profile in minutes
          </p>
          {isLoggedIn ? (
            <UpgradeButton />
          ) : (
            <Link href="/auth/signin?callbackUrl=/become-an-instructor">
              <Button variant="gradient" size="lg">
                Sign Up Now
              </Button>
            </Link>
          )}
          {!isLoggedIn && (
            <p className="text-sm mt-4 text-gray-300">
              Already have an account? Sign in to manage your profile
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
