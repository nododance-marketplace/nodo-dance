'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Bell, Edit, Star, ShieldCheck } from 'lucide-react'

export function EventGateModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-md shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <CardContent className="p-8">
          <h2 className="text-2xl font-bold text-primary mb-6">
            Create a free account to submit your event
          </h2>

          <ul className="space-y-3 mb-8">
            <li className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-accent-coral mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Get notified when your event is approved</span>
            </li>
            <li className="flex items-start gap-3">
              <Edit className="w-5 h-5 text-accent-coral mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Edit or reschedule your event anytime</span>
            </li>
            <li className="flex items-start gap-3">
              <Star className="w-5 h-5 text-accent-coral mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Get featured placement (coming soon)</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-accent-coral mt-0.5 flex-shrink-0" />
              <span className="text-gray-700">Reduce spam and keep the community clean</span>
            </li>
          </ul>

          <div className="space-y-3">
            <Link href="/auth/signin?callbackUrl=/submit-event" className="block">
              <Button variant="gradient" size="lg" className="w-full">
                Create Free Account
              </Button>
            </Link>
            <Link href="/auth/signin?callbackUrl=/submit-event" className="block">
              <Button variant="outline" size="lg" className="w-full">
                I already have an account
              </Button>
            </Link>
          </div>

          <p className="text-xs text-gray-400 text-center mt-4">
            Free for now. No spam.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
