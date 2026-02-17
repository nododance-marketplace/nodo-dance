import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { InstructorProfileView } from '@/components/instructors/instructor-profile-view'

export const dynamic = 'force-dynamic'

export default async function InstructorProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [instructor, session] = await Promise.all([
    prisma.instructorProfile.findUnique({
      where: { slug, isPublished: true },
    }),
    getServerSession(authOptions),
  ])

  if (!instructor) {
    notFound()
  }

  const isLoggedIn = !!session?.user?.email

  // Redact contact email for unauthenticated users
  const safeInstructor = isLoggedIn
    ? instructor
    : { ...instructor, contactEmail: null, contactNotes: null }

  return <InstructorProfileView instructor={safeInstructor} isLoggedIn={isLoggedIn} />
}
