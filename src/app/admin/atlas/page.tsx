import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions, isAdmin } from '@/lib/auth'
import { AtlasAdmin } from '@/components/admin/atlas/atlas-admin'

export const dynamic = 'force-dynamic'

export default async function AtlasAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/auth/signin?callbackUrl=/admin/atlas')
  if (!isAdmin(session.user.email)) redirect('/')

  return (
    <div className="page-shell">
      <AtlasAdmin adminEmail={session.user.email} />
    </div>
  )
}
