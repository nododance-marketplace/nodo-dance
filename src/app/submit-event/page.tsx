'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { DANCE_STYLES, EVENT_TYPES } from '@/lib/constants'
import { CheckCircle, ImagePlus, X } from 'lucide-react'
import { EventGateModal } from '@/components/auth/event-gate-modal'

const DRAFT_KEY = 'eventDraft'

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  eventType: z.enum(['SOCIAL', 'TANGO_MILONGA', 'GROUP_CLASS', 'WORKSHOP', 'FESTIVAL']),
  styles: z.array(z.string()).min(1, 'Select at least one style'),
  startDate: z.string().min(1, 'Start date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().optional(),
  venueName: z.string().min(1, 'Venue name is required'),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  price: z.string().optional(),
  organizerName: z.string().min(1, 'Organizer name is required'),
  organizerEmail: z.string().email('Valid email is required'),
  instagramUrl: z.string().optional().or(z.literal('')),
  websiteUrl: z.string().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required'),
  honeypot: z.string().max(0),
})

type FormData = z.infer<typeof schema>

function loadDraft(): Partial<FormData> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveDraft(data: Partial<FormData>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  } catch {}
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {}
}

const DEFAULT_VALUES: Partial<FormData> = {
  eventType: 'SOCIAL',
  styles: [],
  honeypot: '',
}

export default function SubmitEventPage() {
  const { data: session, status } = useSession()
  const isLoggedIn = !!session?.user
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showGateModal, setShowGateModal] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    reset,
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      reset({ ...DEFAULT_VALUES, ...draft, honeypot: '' })
    }
    setDraftLoaded(true)
  }, [reset])

  // Auto-save draft on field changes (debounced via watch)
  const formValues = watch()
  useEffect(() => {
    if (!draftLoaded) return
    // Don't save honeypot to draft
    const { honeypot, ...draftData } = formValues
    saveDraft(draftData)
  }, [formValues, draftLoaded])

  const selectedStyles = watch('styles') || []

  function handleImageClick() {
    if (!isLoggedIn) {
      // Save current form state before showing gate
      const { honeypot, ...draftData } = getValues()
      saveDraft(draftData)
      setShowGateModal(true)
      return
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isLoggedIn) {
      e.preventDefault()
      const { honeypot, ...draftData } = getValues()
      saveDraft(draftData)
      setShowGateModal(true)
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max size is 5MB.')
      return
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Invalid file type. Only PNG, JPG, and WebP allowed.')
      return
    }

    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  async function uploadImage(): Promise<string | null> {
    if (!imageFile) return null

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', imageFile)

      const res = await fetch('/api/upload/event-image', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        if (error.error === 'AUTH_REQUIRED') {
          setShowGateModal(true)
          return null
        }
        throw new Error(error.error || 'Upload failed')
      }

      const { url } = await res.json()
      return url
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  async function onSubmit(data: FormData) {
    // Client-side gate: if not logged in, show modal
    if (!isLoggedIn) {
      const { honeypot, ...draftData } = data
      saveDraft(draftData)
      setShowGateModal(true)
      return
    }

    setSubmitting(true)
    const submitToast = toast.loading(imageFile ? 'Uploading image...' : 'Submitting event...')

    try {
      // Upload image first if one was selected
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
        if (imageUrl === null && imageFile) {
          // Upload was gated (AUTH_REQUIRED) — modal already shown
          toast.dismiss(submitToast)
          setSubmitting(false)
          return
        }
        toast.loading('Submitting event...', { id: submitToast })
      }

      const response = await fetch('/api/events/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, imageUrl }),
      })

      if (!response.ok) {
        const error = await response.json()
        if (error.error === 'AUTH_REQUIRED') {
          toast.dismiss(submitToast)
          setShowGateModal(true)
          setSubmitting(false)
          return
        }
        throw new Error(error.error || 'Failed to submit event')
      }

      toast.success('Event submitted!', { id: submitToast })
      clearDraft()
      setSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error: any) {
      toast.error(error.message || 'Something went wrong. Please try again.', { id: submitToast })
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-4">Event Submitted!</h1>
            <p className="text-lg text-gray-600 mb-6">
              Thank you for submitting your event. It will be reviewed by our team and published shortly.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="gradient" onClick={() => window.location.href = '/events'}>
                Browse Events
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Submit Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-4">
          Submit an Event
        </h1>
        <p className="text-lg text-gray-600">
          Share your dance event with the community. It&apos;s free!
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-1">Event Title *</label>
              <Input {...register('title')} error={errors.title?.message} />
            </div>

            {/* Event Image */}
            <div>
              <label className="block text-sm font-medium mb-2">Event Image (flyer/poster)</label>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img
                    src={imagePreview}
                    alt="Event image preview"
                    className="w-full max-w-md h-64 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : isLoggedIn ? (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                  <ImagePlus className="w-10 h-10 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Click to upload event flyer or poster</span>
                  <span className="text-xs text-gray-400 mt-1">PNG, JPG or WebP. Max 5MB.</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={handleImageClick}
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <ImagePlus className="w-10 h-10 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Click to upload event flyer or poster</span>
                  <span className="text-xs text-gray-400 mt-1">PNG, JPG or WebP. Max 5MB.</span>
                </button>
              )}
            </div>

            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium mb-1">Event Type *</label>
              <Select {...register('eventType')} error={errors.eventType?.message}>
                {EVENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Dance Styles */}
            <div>
              <label className="block text-sm font-medium mb-2">Dance Styles * (select all that apply)</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {DANCE_STYLES.map((style) => (
                  <Controller
                    key={style}
                    name="styles"
                    control={control}
                    render={({ field }) => (
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          value={style}
                          checked={field.value?.includes(style)}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? [...(field.value || []), style]
                              : field.value?.filter((s) => s !== style) || []
                            field.onChange(newValue)
                          }}
                          className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-sm">{style}</span>
                      </label>
                    )}
                  />
                ))}
              </div>
              {errors.styles && <p className="mt-1 text-sm text-red-500">{errors.styles.message}</p>}
            </div>

            {/* Date & Time */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date *</label>
                <Input type="date" {...register('startDate')} error={errors.startDate?.message} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Time *</label>
                <Input type="time" {...register('startTime')} error={errors.startTime?.message} />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">End Time (optional)</label>
                <Input type="time" {...register('endTime')} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Price (leave blank if free)</label>
                <Input type="number" min="0" {...register('price')} placeholder="0" />
              </div>
            </div>

            {/* Venue */}
            <div>
              <label className="block text-sm font-medium mb-1">Venue Name *</label>
              <Input {...register('venueName')} error={errors.venueName?.message} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Neighborhood (optional)</label>
                <Input {...register('neighborhood')} placeholder="e.g., Uptown, South End" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Full Address (optional)</label>
                <Input {...register('address')} placeholder="Street address" />
              </div>
            </div>

            {/* Organizer Info */}
            <div>
              <label className="block text-sm font-medium mb-1">Organizer Name *</label>
              <Input {...register('organizerName')} error={errors.organizerName?.message} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Organizer Email *</label>
              <Input type="email" {...register('organizerEmail')} error={errors.organizerEmail?.message} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Instagram URL (optional)</label>
                <Input {...register('instagramUrl')} placeholder="https://instagram.com/..." error={errors.instagramUrl?.message} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Website/Ticket Link (optional)</label>
                <Input {...register('websiteUrl')} placeholder="https://..." error={errors.websiteUrl?.message} />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description *</label>
              <Textarea
                {...register('description')}
                rows={6}
                placeholder="Describe your event, what to expect, dress code, etc."
                error={errors.description?.message}
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

            <div className="pt-4">
              <Button type="submit" disabled={submitting || uploadingImage} variant="gradient" size="lg" className="w-full">
                {uploadingImage ? 'Uploading Image...' : submitting ? 'Submitting...' : 'Submit Event'}
              </Button>
              <p className="text-sm text-gray-500 mt-3 text-center">
                Your event will be reviewed before publication
              </p>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Gate Modal */}
      {showGateModal && <EventGateModal onClose={() => setShowGateModal(false)} />}
    </div>
  )
}
