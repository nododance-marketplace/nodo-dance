import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CreateBusinessForm } from './create-business-form'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  TEACHER: 'Teacher',
  ACADEMY: 'Academy',
  ORGANIZER: 'Organizer',
}

function parseStyles(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Business workspace entry point. Owners see every business they own with its
 * published offerings; without one, the create card is the whole page.
 */
export default async function ManagePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) redirect('/auth/signin')

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) redirect('/auth/signin')

  const memberships = await prisma.businessMember.findMany({
    where: { userId: user.id, role: 'OWNER' },
    orderBy: { createdAt: 'asc' },
    include: {
      business: {
        include: {
          _count: { select: { offerings: true } },
          offerings: {
            where: { status: 'PUBLISHED' },
            orderBy: { createdAt: 'desc' },
            select: { id: true, slug: true, title: true, type: true, styles: true },
          },
        },
      },
    },
  })

  const businesses = memberships.map((m) => m.business)

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-heading">Manage Business</h1>
          <p className="page-intro">
            Publish your classes and socials, and see who is coming.
          </p>
        </div>
      </div>

      {businesses.length === 0 ? (
        <CreateBusinessForm />
      ) : (
        <div className="space-y-6 max-w-3xl">
          {businesses.map((business) => (
            <section key={business.id} className="section-panel" aria-labelledby={`biz-${business.slug}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 id={`biz-${business.slug}`} className="text-2xl font-bold text-primary">
                    {business.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {KIND_LABEL[business.kind] ?? business.kind}
                    {business.city ? ` · ${business.city}` : ''}
                    {` · ${business._count.offerings} offering${business._count.offerings === 1 ? '' : 's'}`}
                  </p>
                </div>
                <Link
                  href={`/manage/${business.slug}`}
                  className="text-sm font-medium text-accent-ink hover:underline whitespace-nowrap"
                >
                  Open dashboard →
                </Link>
              </div>

              {business.offerings.length > 0 && (
                <ul role="list" className="mt-5 divide-y divide-gray-200 border-t border-gray-200">
                  {business.offerings.map((offering) => (
                    <li key={offering.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {offering.title}
                        </p>
                        <p className="text-xs text-gray-600">
                          {offering.type === 'CLASS' ? 'Class' : 'Event'}
                          {parseStyles(offering.styles).length > 0
                            ? ` · ${parseStyles(offering.styles).join(', ')}`
                            : ''}
                        </p>
                      </div>
                      <Link
                        href={`/o/${offering.slug}`}
                        className="text-xs text-gray-700 hover:text-primary hover:underline whitespace-nowrap"
                      >
                        View public page
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

    </main>
  )
}
