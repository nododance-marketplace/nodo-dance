import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { InstructorProfileView } from '@/components/instructors/instructor-profile-view'

export const dynamic = 'force-dynamic'

export default async function InstructorProfilePage({
  params,
}: {
  params: { slug: string }
}) {
  const [instructor, session] = await Promise.all([
    prisma.instructorProfile.findUnique({
      where: { slug: params.slug, isPublished: true },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
    getServerSession(authOptions),
  ])

  if (!instructor) {
    notFound()
  }

  const isLoggedIn = !!session?.user?.email

  return <InstructorProfileView instructor={instructor} isLoggedIn={isLoggedIn} />
}
