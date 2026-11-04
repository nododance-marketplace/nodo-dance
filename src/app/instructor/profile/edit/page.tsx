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
    <div className="form-page">
      <h1 className="page-heading mb-8">
        {user.instructorProfile ? 'Edit Profile' : 'Create Profile'}
      </h1>
      <InstructorProfileEditor user={user} profile={user.instructorProfile} redirectTo="/instructor/dashboard" />
    </div>
  )
}
