'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { DANCE_STYLES, SKILL_LEVELS, LOCATION_TYPES } from '@/lib/constants'
import { parseJsonArray } from '@/lib/utils'
import slugify from 'slugify'

const schema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  photoUrl: z.string().url('Valid URL required').optional().or(z.literal('')),
  styles: z.array(z.string()).min(1, 'Select at least one style'),
  skillLevels: z.array(z.string()),
  offersPrivate: z.boolean(),
  privateRateHourly: z.string().optional(),
  offersGroup: z.boolean(),
  groupRatePerClass: z.string().optional(),
  groupClassNotes: z.string().optional(),
  locationType: z.string().optional(),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  travelRadiusMiles: z.string().optional(),
  paymentCash: z.boolean(),
  paymentVenmo: z.string().optional(),
  paymentCashApp: z.string().optional(),
  paymentPayPal: z.string().optional(),
  instagramUrl: z.string().url('Valid URL required').optional().or(z.literal('')),
  websiteUrl: z.string().url('Valid URL required').optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

export function ProfileEditor({ user, profile }: { user: any; profile: any }) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: profile
      ? {
          displayName: profile.displayName || '',
          bio: profile.bio || '',
          photoUrl: profile.photoUrl || '',
          styles: parseJsonArray(profile.styles),
          skillLevels: parseJsonArray(profile.skillLevels),
          offersPrivate: profile.offersPrivate,
          privateRateHourly: profile.privateRateHourly?.toString() || '',
          offersGroup: profile.offersGroup,
          groupRatePerClass: profile.groupRatePerClass?.toString() || '',
          groupClassNotes: profile.groupClassNotes || '',
          locationType: profile.locationType || '',
          neighborhood: profile.neighborhood || '',
          address: profile.address || '',
          travelRadiusMiles: profile.travelRadiusMiles?.toString() || '',
          paymentCash: profile.paymentCash,
          paymentVenmo: profile.paymentVenmo || '',
          paymentCashApp: profile.paymentCashApp || '',
          paymentPayPal: profile.paymentPayPal || '',
          instagramUrl: profile.instagramUrl || '',
          websiteUrl: profile.websiteUrl || '',
        }
      : {
          styles: [],
          skillLevels: [],
          offersPrivate: false,
          offersGroup: false,
          paymentCash: false,
        },
  })

  const offersPrivate = watch('offersPrivate')
  const offersGroup = watch('offersGroup')

  async function onSubmit(data: FormData) {
    setSaving(true)
    setSuccess(false)

    try {
      const slug = profile?.slug || slugify(data.displayName, { lower: true, strict: true })

      const response = await fetch('/api/instructor-profile', {
        method: profile ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          slug,
          privateRateHourly: data.privateRateHourly ? parseInt(data.privateRateHourly) : null,
          groupRatePerClass: data.groupRatePerClass ? parseInt(data.groupRatePerClass) : null,
          travelRadiusMiles: data.travelRadiusMiles ? parseInt(data.travelRadiusMiles) : null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save profile')
      }

      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    } catch (error: any) {
      alert(error.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        {success && (
          <div className="mb-6 p-4 bg-green-100 text-green-800 rounded-lg">
            Profile saved successfully!
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name *</label>
                <Input {...register('displayName')} error={errors.displayName?.message} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Bio (optional)</label>
                <Textarea
                  {...register('bio')}
                  rows={4}
                  placeholder="Tell students about yourself, your experience, teaching style..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Photo URL (optional)</label>
                <Input {...register('photoUrl')} placeholder="https://..." error={errors.photoUrl?.message} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Teaching Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Dance Styles * (select all you teach)</label>
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

              <div>
                <label className="block text-sm font-medium mb-2">Skill Levels (optional)</label>
                <div className="flex gap-4">
                  {SKILL_LEVELS.map((level) => (
                    <Controller
                      key={level}
                      name="skillLevels"
                      control={control}
                      render={({ field }) => (
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            value={level}
                            checked={field.value?.includes(level)}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? [...(field.value || []), level]
                                : field.value?.filter((l) => l !== level) || []
                              field.onChange(newValue)
                            }}
                            className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">{level}</span>
                        </label>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Pricing</h3>
            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('offersPrivate')}
                  className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">I offer private lessons</span>
              </label>

              {offersPrivate && (
                <div>
                  <label className="block text-sm font-medium mb-1">Private Rate ($/hour)</label>
                  <Input
                    type="number"
                    min="0"
                    {...register('privateRateHourly')}
                    placeholder="e.g., 75"
                  />
                </div>
              )}

              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('offersGroup')}
                  className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">I offer group classes</span>
              </label>

              {offersGroup && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Group Rate ($/class)</label>
                    <Input
                      type="number"
                      min="0"
                      {...register('groupRatePerClass')}
                      placeholder="e.g., 20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Group Class Notes (optional)</label>
                    <Input
                      {...register('groupClassNotes')}
                      placeholder="e.g., Wednesdays at Dance Studio X"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Location</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Location Type</label>
                <Select {...register('locationType')}>
                  <option value="">Select...</option>
                  {LOCATION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Neighborhood</label>
                <Input {...register('neighborhood')} placeholder="e.g., Uptown, South End" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Full Address (optional)</label>
                <Input {...register('address')} placeholder="Street address" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Travel Radius (miles, optional)</label>
                <Input type="number" min="0" {...register('travelRadiusMiles')} placeholder="e.g., 10" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register('paymentCash')}
                  className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm">I accept cash</span>
              </label>

              <div>
                <label className="block text-sm font-medium mb-1">Venmo Username (optional)</label>
                <Input {...register('paymentVenmo')} placeholder="username" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Cash App Username (optional)</label>
                <Input {...register('paymentCashApp')} placeholder="username" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">PayPal Username (optional)</label>
                <Input {...register('paymentPayPal')} placeholder="username" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Social Links</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Instagram URL (optional)</label>
                <Input
                  {...register('instagramUrl')}
                  placeholder="https://instagram.com/..."
                  error={errors.instagramUrl?.message}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Website URL (optional)</label>
                <Input
                  {...register('websiteUrl')}
                  placeholder="https://..."
                  error={errors.websiteUrl?.message}
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" disabled={saving} variant="gradient" size="lg" className="w-full">
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
