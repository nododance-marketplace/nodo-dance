'use server'

import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  slug: z.string(),
  displayName: z.string(),
  headline: z.string().max(100).optional(),
  bio: z.string().optional(),
  photoUrl: z.string().optional().or(z.literal('')),
  styles: z.array(z.string()),
  otherStyle: z.string().optional(),
  skillLevels: z.array(z.string()),
  offerings: z.array(z.string()),
  languages: z.array(z.string()),
  yearsTeaching: z.number().nullable(),
  studentsTaught: z.number().nullable(),
  certifications: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  offersPrivate: z.boolean(),
  privateRateHourly: z.number().nullable(),
  offersGroup: z.boolean(),
  groupRatePerClass: z.number().nullable(),
  groupClassNotes: z.string().optional(),
  locationType: z.string().optional(),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  travelRadiusMiles: z.number().nullable(),
  paymentCash: z.boolean(),
  paymentVenmo: z.string().optional(),
  paymentCashApp: z.string().optional(),
  paymentPayPal: z.string().optional(),
  instagramUrl: z.string().url().optional().or(z.literal('')),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  bookingUrl: z.string().url().optional().or(z.literal('')),
  youtubeUrl: z.string().url().optional().or(z.literal('')),
  tiktokUrl: z.string().url().optional().or(z.literal('')),
  isPublished: z.boolean().optional(),
})

type ProfileData = z.infer<typeof schema>

export async function saveInstructorProfile(data: ProfileData) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return { success: false, error: 'Unauthorized' }
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { instructorProfile: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Validate data
    const validatedData = schema.parse(data)

    const profileData = {
      userId: user.id,
      slug: validatedData.slug,
      displayName: validatedData.displayName,
      headline: validatedData.headline || null,
      bio: validatedData.bio || null,
      photoUrl: validatedData.photoUrl || null,
      styles: JSON.stringify(validatedData.styles),
      otherStyle: validatedData.otherStyle || null,
      skillLevels: JSON.stringify(validatedData.skillLevels),
      offerings: JSON.stringify(validatedData.offerings || []),
      languages: JSON.stringify(validatedData.languages || []),
      yearsTeaching: validatedData.yearsTeaching,
      studentsTaught: validatedData.studentsTaught,
      certifications: validatedData.certifications || null,
      rating: validatedData.rating ?? (user.instructorProfile?.rating || 4.9),
      offersPrivate: validatedData.offersPrivate,
      privateRateHourly: validatedData.privateRateHourly,
      offersGroup: validatedData.offersGroup,
      groupRatePerClass: validatedData.groupRatePerClass,
      groupClassNotes: validatedData.groupClassNotes || null,
      locationType: validatedData.locationType || null,
      neighborhood: validatedData.neighborhood || null,
      address: validatedData.address || null,
      travelRadiusMiles: validatedData.travelRadiusMiles,
      paymentCash: validatedData.paymentCash,
      paymentVenmo: validatedData.paymentVenmo || null,
      paymentCashApp: validatedData.paymentCashApp || null,
      paymentPayPal: validatedData.paymentPayPal || null,
      instagramUrl: validatedData.instagramUrl || null,
      websiteUrl: validatedData.websiteUrl || null,
      bookingUrl: validatedData.bookingUrl || null,
      youtubeUrl: validatedData.youtubeUrl || null,
      tiktokUrl: validatedData.tiktokUrl || null,
      isPublished: validatedData.isPublished ?? true,
    }

    // Create or update profile
    const profile = user.instructorProfile
      ? await prisma.instructorProfile.update({
          where: { id: user.instructorProfile.id },
          data: profileData,
        })
      : await prisma.instructorProfile.create({
          data: profileData,
        })

    // Revalidate all pages that show this profile
    revalidatePath('/instructor/dashboard')
    revalidatePath('/instructor/profile/edit')
    revalidatePath('/instructors')
    revalidatePath(`/instructors/${profile.slug}`)

    return { success: true, profile }
  } catch (error: any) {
    console.error('[saveInstructorProfile] Error:', error)

    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid data', details: error.errors }
    }

    return { success: false, error: error.message || 'Failed to save profile' }
  }
}
