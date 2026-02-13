import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, getDashboardUrl } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect('/auth/signin')
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })

  // Redirect to the appropriate dashboard based on role
  redirect(getDashboardUrl(user?.role))
}
