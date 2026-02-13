import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { InstructorProfileEditor } from '@/components/instructors/instructor-profile-editor'

export const dynamic = 'force-dynamic'

export default async function ProfileEditPage() {
  // Auth check
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    redirect('/auth/signin?callbackUrl=/instructor/profile/edit')
  }

  // Fetch user and profile
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { instructorProfile: true },
  })

  if (!user) {
    redirect('/auth/signin')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        {user.instructorProfile ? 'Edit Profile' : 'Create Profile'}
      </h1>
      <InstructorProfileEditor user={user} profile={user.instructorProfile} redirectTo="/instructor/dashboard" />
    </div>
  )
}
