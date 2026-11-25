import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { DoorScanner } from './door-scanner'

export const dynamic = 'force-dynamic'

/**
 * Door check-in (M2): a phone-friendly page for check-in staff. Paste or type
 * a NODO- code, scan, get an instant verdict. The server owns every decision —
 * this page only renders what /api/checkin answers.
 */
export default async function CheckInPage() {
  const session = await getServerSession(authOptions)

  return (
    <main className="page-shell">
      <div className="max-w-md mx-auto">
        <h1 className="text-4xl font-bold text-primary leading-tight">Door check-in</h1>
        <p className="mt-2 text-sm text-gray-600">
          Type or paste a guest&apos;s <span className="font-mono">NODO-</span> ticket
          code. First scan wins — repeat scans show the original time.
        </p>

        {session?.user?.email ? (
          <DoorScanner />
        ) : (
          <div role="status" className="mt-8 bg-surface border border-gray-200 rounded-xl p-6">
            <p className="text-sm text-gray-700">
              Sign in with the account your organizer invited you with.
            </p>
            <Link
              href="/auth/signin"
              className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-dark text-sm font-semibold"
            >
              Sign in →
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
