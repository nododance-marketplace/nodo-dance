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
    <div className="page-shell">
      <div className="mb-12 max-w-3xl">
        <h1 className="page-heading mb-4">
          Become an Instructor
        </h1>
        <p className="page-intro">
          Connect with students and grow your dance business
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-x-12 gap-y-4 mb-12">
        <Card className="rounded-none border-0 border-t border-gray-200 bg-transparent shadow-none">
          <CardContent className="px-0 py-8">
            <Users className="w-7 h-7 text-accent-coral float-right ml-4" />
            <h3 className="text-2xl font-bold mb-3">Reach More Students</h3>
            <p className="text-gray-600">
              Get discovered by students actively looking for dance instructors in Charlotte
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-none border-0 border-t border-gray-200 bg-transparent shadow-none">
          <CardContent className="px-0 py-8">
            <DollarSign className="w-7 h-7 text-accent-coral float-right ml-4" />
            <h3 className="text-2xl font-bold mb-3">100% Free</h3>
            <p className="text-gray-600">
              Create your profile, receive lesson requests, and keep all your earnings
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-none border-0 border-t border-gray-200 bg-transparent shadow-none">
          <CardContent className="px-0 py-8">
            <Calendar className="w-7 h-7 text-accent-coral float-right ml-4" />
            <h3 className="text-2xl font-bold mb-3">Manage Your Schedule</h3>
            <p className="text-gray-600">
              Work on your own terms. Accept requests that fit your availability
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-none border-0 border-t border-gray-200 bg-transparent shadow-none">
          <CardContent className="px-0 py-8">
            <Heart className="w-7 h-7 text-accent-coral float-right ml-4" />
            <h3 className="text-2xl font-bold mb-3">Support the Community</h3>
            <p className="text-gray-600">
              Help grow Charlotte&apos;s partner dance scene and share your passion
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-primary/5 border-primary/15">
        <CardContent className="p-6 sm:p-10">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-lg mb-6 text-gray-600">
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
            <p className="text-sm mt-4 text-gray-600">
              Already have an account? Sign in to manage your profile
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
