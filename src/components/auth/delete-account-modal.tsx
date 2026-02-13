'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle } from 'lucide-react'

export function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)

  const isConfirmed = confirmation === 'DELETE'

  async function handleDelete() {
    if (!isConfirmed) return

    setDeleting(true)
    const deleteToast = toast.loading('Deleting your account...')

    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete account')
      }

      toast.success('Account deleted. Goodbye!', { id: deleteToast })

      // Sign out and redirect to home
      await signOut({ redirect: false })
      router.push('/')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete account', { id: deleteToast })
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-red-900">Delete Account</h2>
        </div>

        <p className="text-gray-700 mb-2">
          This action is <strong>permanent and irreversible</strong>. It will delete:
        </p>
        <ul className="text-sm text-gray-600 mb-4 list-disc list-inside space-y-1">
          <li>Your instructor profile</li>
          <li>All lesson requests</li>
          <li>Your saved items</li>
          <li>Your account and login credentials</li>
        </ul>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Type <strong>DELETE</strong> to confirm
          </label>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            disabled={deleting}
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete My Account'}
          </Button>
        </div>
      </div>
    </div>
  )
}
