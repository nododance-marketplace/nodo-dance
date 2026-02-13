import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { AdminPanel } from './admin-panel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
    redirect('/auth/signin?callbackUrl=/admin')
  }

  if (!isAdmin(session.user.email)) {
    redirect('/')
  }

  return <AdminPanel adminEmail={session.user.email} />
}
