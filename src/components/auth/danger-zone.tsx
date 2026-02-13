'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { DeleteAccountModal } from './delete-account-modal'

export function DangerZone() {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <Card className="border-red-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <Button variant="destructive" size="sm" onClick={() => setShowModal(true)}>
            Delete Account
          </Button>
        </CardContent>
      </Card>

      {showModal && <DeleteAccountModal onClose={() => setShowModal(false)} />}
    </>
  )
}
