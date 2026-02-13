'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { X } from 'lucide-react'
import { parseJsonArray } from '@/lib/utils'
import { LESSON_TYPES } from '@/lib/constants'

const schema = z.object({
  studentName: z.string().min(1, 'Name is required'),
  studentEmail: z.string().email('Valid email is required'),
  studentPhone: z.string().optional(),
  style: z.string().min(1, 'Please select a style'),
  lessonType: z.enum(['PRIVATE', 'GROUP', 'EITHER']),
  preferredTimes: z.string().min(1, 'Preferred times are required'),
  message: z.string().min(10, 'Please provide more details'),
  honeypot: z.string().max(0),
})

type FormData = z.infer<typeof schema>

export function LessonRequestModal({
  instructor,
  onClose,
}: {
  instructor: any
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const styles = parseJsonArray(instructor.styles)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      lessonType: 'EITHER',
      honeypot: '',
    },
  })

  async function onSubmit(data: FormData) {
    setSubmitting(true)

    try {
      const response = await fetch('/api/lesson-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          instructorProfileId: instructor.id,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send request')
      }

      setSuccess(true)
    } catch (error: any) {
      alert(error.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Request a Lesson</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Request Sent!</h3>
              <p className="text-gray-600 mb-6">
                {instructor.displayName} will contact you shortly at your email.
              </p>
              <Button onClick={onClose}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Your Name *</label>
                <Input {...register('studentName')} error={errors.studentName?.message} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Your Email *</label>
                <Input type="email" {...register('studentEmail')} error={errors.studentEmail?.message} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone Number (optional)</label>
                <Input type="tel" {...register('studentPhone')} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Dance Style *</label>
                <Select {...register('style')} error={errors.style?.message}>
                  <option value="">Select a style</option>
                  {styles.map((style) => (
                    <option key={style} value={style}>
                      {style}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Lesson Type *</label>
                <Select {...register('lessonType')} error={errors.lessonType?.message}>
                  {LESSON_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Preferred Times *</label>
                <Input
                  {...register('preferredTimes')}
                  placeholder="e.g., Weekday evenings, Saturday mornings"
                  error={errors.preferredTimes?.message}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Message *</label>
                <Textarea
                  {...register('message')}
                  rows={4}
                  placeholder="Tell the instructor about your experience level, goals, and any questions..."
                  error={errors.message?.message}
                />
              </div>

              {/* Honeypot */}
              <input
                type="text"
                {...register('honeypot')}
                style={{ position: 'absolute', left: '-9999px' }}
                tabIndex={-1}
                autoComplete="off"
              />

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={submitting} variant="gradient" className="flex-1">
                  {submitting ? 'Sending...' : 'Send Request'}
                </Button>
                <Button type="button" onClick={onClose} variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
