'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { DANCE_STYLES, SKILL_LEVELS, LOCATION_TYPES, INSTRUCTOR_OFFERINGS, LANGUAGES } from '@/lib/constants'
import { parseJsonArray, getYouTubeEmbedUrl } from '@/lib/utils'
import slugify from 'slugify'

const schema = z.object({
  displayName: z.string().min(1, 'Name is required'),
  headline: z.string().max(100).optional().or(z.literal('')),
  bio: z.string().optional(),
  photoUrl: z.string().optional().or(z.literal('')),
  styles: z.array(z.string()).min(1, 'Select at least one style'),
  otherStyle: z.string().optional().or(z.literal('')),
  skillLevels: z.array(z.string()),
  offerings: z.array(z.string()),
  languages: z.array(z.string()),
  yearsTeaching: z.string().optional().or(z.literal('')),
  studentsTaught: z.string().optional().or(z.literal('')),
  certifications: z.string().optional().or(z.literal('')),
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
  contactEmail: z.string().email('Valid email is required').min(1, 'Contact email is required'),
  preferredContactMethod: z.string().optional().or(z.literal('')),
  contactNotes: z.string().optional().or(z.literal('')),
  isDJ: z.boolean(),
  djStyles: z.array(z.string()),
  instagramUrl: z.string().optional().or(z.literal('')),
  websiteUrl: z.string().optional().or(z.literal('')),
  bookingUrl: z.string().optional().or(z.literal('')),
  youtubeUrl: z.string().optional().or(z.literal('')),
  tiktokUrl: z.string().optional().or(z.literal('')),
  isPublished: z.boolean(),
}).refine(
  (data) => !data.styles?.includes('Other') || (data.otherStyle && data.otherStyle.trim().length >= 2),
  { message: 'Please specify the style (min 2 characters)', path: ['otherStyle'] }
)

type FormData = z.infer<typeof schema>

export function InstructorProfileEditor({ user, profile, redirectTo }: { user: any; profile: any; redirectTo?: string }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(profile?.photoUrl || '')
  const [hasChanges, setHasChanges] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: profile
      ? {
          displayName: profile.displayName || '',
          headline: profile.headline || '',
          bio: profile.bio || '',
          photoUrl: profile.photoUrl || '',
          styles: parseJsonArray(profile.styles),
          otherStyle: profile.otherStyle || '',
          skillLevels: parseJsonArray(profile.skillLevels),
          offerings: parseJsonArray(profile.offerings),
          languages: parseJsonArray(profile.languages),
          yearsTeaching: profile.yearsTeaching?.toString() || '',
          studentsTaught: profile.studentsTaught?.toString() || '',
          certifications: profile.certifications || '',
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
          contactEmail: profile.contactEmail || user?.email || '',
          preferredContactMethod: profile.preferredContactMethod || '',
          contactNotes: profile.contactNotes || '',
          isDJ: profile.isDJ ?? false,
          djStyles: parseJsonArray(profile.djStyles),
          instagramUrl: profile.instagramUrl || '',
          websiteUrl: profile.websiteUrl || '',
          bookingUrl: profile.bookingUrl || '',
          youtubeUrl: profile.youtubeUrl || profile.youtubeVideoUrl || '',
          tiktokUrl: profile.tiktokUrl || '',
          isPublished: profile.isPublished ?? true,
        }
      : {
          contactEmail: user?.email || '',
          styles: [],
          skillLevels: [],
          offerings: [],
          languages: [],
          offersPrivate: false,
          offersGroup: false,
          paymentCash: false,
          isDJ: false,
          djStyles: [],
          isPublished: true,
        },
  })

  const offersPrivate = watch('offersPrivate')
  const offersGroup = watch('offersGroup')
  const selectedStyles = watch('styles')
  const youtubeUrl = watch('youtubeUrl')
  const showOtherStyle = selectedStyles?.includes('Other')
  const isDJ = watch('isDJ')
  const embedUrl = getYouTubeEmbedUrl(youtubeUrl)

  // Track form changes
  useEffect(() => {
    setHasChanges(isDirty)
  }, [isDirty])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
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

    setUploadingPhoto(true)
    const uploadToast = toast.loading('Uploading photo...')

    try {
      const formData = new FormData()
      formData.append('photo', file)

      const response = await fetch('/api/upload/profile-photo', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      const { url } = await response.json()
      setValue('photoUrl', url, { shouldDirty: true })
      setPhotoPreview(url)
      toast.success('Photo uploaded!', { id: uploadToast })
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload photo', { id: uploadToast })
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function onSubmit(data: FormData) {
    setSaving(true)
    const saveToast = toast.loading('Saving profile...')

    try {
      const slug = profile?.slug || slugify(data.displayName, { lower: true, strict: true })

      const payload = {
        ...data,
        slug,
        privateRateHourly: data.privateRateHourly ? parseInt(data.privateRateHourly) : null,
        groupRatePerClass: data.groupRatePerClass ? parseInt(data.groupRatePerClass) : null,
        travelRadiusMiles: data.travelRadiusMiles ? parseInt(data.travelRadiusMiles) : null,
        yearsTeaching: data.yearsTeaching ? parseInt(data.yearsTeaching) : null,
        studentsTaught: data.studentsTaught ? parseInt(data.studentsTaught) : null,
      }

      const res = await fetch('/api/instructor-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to save profile')
      }

      toast.success('Profile saved successfully!', { id: saveToast })
      setHasChanges(false)

      // Refresh server components so dashboard + public profile update
      router.refresh()

      // Redirect after a brief delay (if redirectTo is provided)
      if (redirectTo) {
        setTimeout(() => {
          router.push(redirectTo)
        }, 1000)
      }
    } catch (error: any) {
      console.error('[Profile Editor] Save error:', error)
      toast.error(error.message || 'Failed to save profile', { id: saveToast })
    } finally {
      setSaving(false)
    }
  }

  const isSaveDisabled = saving || uploadingPhoto || (!hasChanges && !!profile)

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name *</label>
                <Input {...register('displayName')} error={errors.displayName?.message} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Headline (optional)</label>
                <Input
                  {...register('headline')}
                  maxLength={100}
                  placeholder="e.g., Salsa & Bachata instructor with 10+ years experience"
                  error={errors.headline?.message}
                />
                <p className="text-xs text-gray-500 mt-1">Short tagline that appears on your card (max 100 characters)</p>
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
                <label className="block text-sm font-medium mb-2">Profile Photo</label>
                {photoPreview && (
                  <div className="mb-3">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-32 h-32 object-cover rounded-lg"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-medium
                    file:bg-primary/10 file:text-primary
                    hover:file:bg-primary/20 file:cursor-pointer"
                />
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG or WebP. Max 5MB. {uploadingPhoto && '(Uploading...)'}
                </p>
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

              {showOtherStyle && (
                <div>
                  <label className="block text-sm font-medium mb-1">Please specify other style *</label>
                  <Input {...register('otherStyle')} placeholder="e.g., Hip Hop, Contemporary, etc." error={errors.otherStyle?.message} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">What I Offer (optional)</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {INSTRUCTOR_OFFERINGS.map((offering) => (
                    <Controller
                      key={offering}
                      name="offerings"
                      control={control}
                      render={({ field }) => (
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            value={offering}
                            checked={field.value?.includes(offering)}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? [...(field.value || []), offering]
                                : field.value?.filter((o) => o !== offering) || []
                              field.onChange(newValue)
                            }}
                            className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">{offering}</span>
                        </label>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Languages (optional)</label>
                <div className="flex flex-wrap gap-3">
                  {LANGUAGES.map((language) => (
                    <Controller
                      key={language}
                      name="languages"
                      control={control}
                      render={({ field }) => (
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            value={language}
                            checked={field.value?.includes(language)}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? [...(field.value || []), language]
                                : field.value?.filter((l) => l !== language) || []
                              field.onChange(newValue)
                            }}
                            className="mr-2 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">{language}</span>
                        </label>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Years Teaching (optional)</label>
                <Input
                  type="number"
                  min="0"
                  max="99"
                  {...register('yearsTeaching')}
                  placeholder="e.g., 10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Students Taught (optional)</label>
                <Input
                  type="number"
                  min="0"
                  {...register('studentsTaught')}
                  placeholder="e.g., 500"
                />
                <p className="text-xs text-gray-500 mt-1">Total students you&apos;ve taught (approximate)</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Certifications (optional)</label>
                <Textarea
                  {...register('certifications')}
                  rows={3}
                  placeholder="List your dance certifications, one per line"
                />
                <p className="text-xs text-gray-500 mt-1">e.g., Salsa Instructor Certified (2018), Bachata Bronze Level</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Rating</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={profile?.rating || '4.9'}
                    disabled
                    className="w-20 bg-gray-50"
                  />
                  <span className="text-sm text-gray-500">(Placeholder - will be calculated from reviews)</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">DJ</h3>
            <div className="space-y-4">
              <label className="flex items-start">
                <input
                  type="checkbox"
                  {...register('isDJ')}
                  className="mt-1 mr-3 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <span className="text-sm font-medium">I also DJ</span>
                  <p className="text-xs text-gray-500 mt-1">
                    Check if you DJ socials/events
                  </p>
                </div>
              </label>

              {isDJ && (
                <div>
                  <label className="block text-sm font-medium mb-2">DJ Styles (select all that apply)</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {DANCE_STYLES.filter((s) => s !== 'Other').map((style) => (
                      <Controller
                        key={`dj-${style}`}
                        name="djStyles"
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
                </div>
              )}
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
            <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
            <p className="text-sm text-gray-500 mb-4">
              Your contact email is shown only to logged-in users so they can reach you for lessons.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Email *</label>
                <Input
                  type="email"
                  {...register('contactEmail')}
                  placeholder="your@email.com"
                  error={errors.contactEmail?.message}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is the email students will use to contact you (hidden from non-logged-in visitors)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Preferred Contact Method (optional)</label>
                <Select {...register('preferredContactMethod')}>
                  <option value="">Select...</option>
                  <option value="Email">Email</option>
                  <option value="Instagram DM">Instagram DM</option>
                  <option value="Website Form">Website Form</option>
                  <option value="Text">Text (future)</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Contact Notes (optional)</label>
                <Input
                  {...register('contactNotes')}
                  placeholder="e.g., Best time to reach me: evenings"
                />
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

              <div>
                <label className="block text-sm font-medium mb-1">Booking URL (optional)</label>
                <Input
                  {...register('bookingUrl')}
                  placeholder="https://calendly.com/yourname"
                  error={errors.bookingUrl?.message}
                />
                <p className="text-xs text-gray-500 mt-1">Link to your booking calendar or scheduling page</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">YouTube Video URL (optional)</label>
                <Input
                  {...register('youtubeUrl')}
                  placeholder="https://youtube.com/watch?v=..."
                  error={errors.youtubeUrl?.message}
                />
                <p className="text-xs text-gray-500 mt-1">Featured video to showcase your dancing or teaching style</p>
                {embedUrl && (
                  <div className="mt-3 aspect-video rounded-lg overflow-hidden">
                    <iframe
                      src={embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">TikTok URL (optional)</label>
                <Input
                  {...register('tiktokUrl')}
                  placeholder="https://tiktok.com/@..."
                  error={errors.tiktokUrl?.message}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Visibility</h3>
            <label className="flex items-start">
              <input
                type="checkbox"
                {...register('isPublished')}
                className="mt-1 mr-3 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div>
                <span className="text-sm font-medium">Make my profile public</span>
                <p className="text-xs text-gray-500 mt-1">
                  When unchecked, your profile will be hidden from the directory
                </p>
              </div>
            </label>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <Button
              type="submit"
              disabled={isSaveDisabled}
              variant="gradient"
              size="lg"
              className="flex-1"
            >
              {saving ? 'Saving...' : uploadingPhoto ? 'Uploading Photo...' : 'Save Profile'}
            </Button>
            {!hasChanges && !!profile && !saving && (
              <p className="text-sm text-gray-500">No changes to save</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
