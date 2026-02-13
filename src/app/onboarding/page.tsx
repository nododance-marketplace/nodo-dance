import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, getDashboardUrl } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OnboardingPicker } from '@/components/auth/onboarding-picker'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect('/auth/signin')
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true, instructorProfile: true },
  })

  if (!user) {
    redirect('/auth/signin')
  }

  // If user already has INSTRUCTOR role, send them to instructor dashboard
  if (user.role === 'INSTRUCTOR') {
    redirect('/instructor/dashboard')
  }

  // If user is a DANCER with existing saved items or activity, they already chose — go to account
  // But for new DANCER default users, show the picker so they can confirm or upgrade
  // We check if they have an instructorProfile as a signal they were a previous INSTRUCTOR
  if (user.instructorProfile) {
    redirect('/instructor/dashboard')
  }

  return <OnboardingPicker />
}
