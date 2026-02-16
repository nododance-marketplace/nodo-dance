import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AccountDashboard } from '@/components/account/account-dashboard'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect('/auth/signin?callbackUrl=/account')
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      savedInstructors: {
        include: {
          instructor: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      savedEvents: {
        include: {
          event: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      submittedEvents: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!user) {
    redirect('/auth/signin')
  }

  return (
    <AccountDashboard
      user={user}
      savedInstructors={user.savedInstructors}
      savedEvents={user.savedEvents}
      submittedEvents={user.submittedEvents}
    />
  )
}
