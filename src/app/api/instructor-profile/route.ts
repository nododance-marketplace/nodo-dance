import { NextRequest, NextResponse } from 'next/server'
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
  instagramUrl: z.string().optional().or(z.literal('')),
  websiteUrl: z.string().optional().or(z.literal('')),
  bookingUrl: z.string().optional().or(z.literal('')),
  youtubeUrl: z.string().optional().or(z.literal('')),
  tiktokUrl: z.string().optional().or(z.literal('')),
  isPublished: z.boolean().optional(),
})

function buildProfileData(data: z.infer<typeof schema>) {
  return {
    slug: data.slug,
    displayName: data.displayName,
    headline: data.headline || null,
    bio: data.bio || null,
    photoUrl: data.photoUrl || null,
    styles: JSON.stringify(data.styles),
    otherStyle: data.otherStyle || null,
    skillLevels: JSON.stringify(data.skillLevels),
    offerings: JSON.stringify(data.offerings || []),
    languages: JSON.stringify(data.languages || []),
    yearsTeaching: data.yearsTeaching,
    studentsTaught: data.studentsTaught,
    certifications: data.certifications || null,
    offersPrivate: data.offersPrivate,
    privateRateHourly: data.privateRateHourly,
    offersGroup: data.offersGroup,
    groupRatePerClass: data.groupRatePerClass,
    groupClassNotes: data.groupClassNotes || null,
    locationType: data.locationType || null,
    neighborhood: data.neighborhood || null,
    address: data.address || null,
    travelRadiusMiles: data.travelRadiusMiles,
    paymentCash: data.paymentCash,
    paymentVenmo: data.paymentVenmo || null,
    paymentCashApp: data.paymentCashApp || null,
    paymentPayPal: data.paymentPayPal || null,
    instagramUrl: data.instagramUrl || null,
    websiteUrl: data.websiteUrl || null,
    bookingUrl: data.bookingUrl || null,
    youtubeUrl: data.youtubeUrl || null,
    tiktokUrl: data.tiktokUrl || null,
    isPublished: data.isPublished ?? true,
  }
}

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { instructorProfile: true },
  })

  return user
}

// POST — create new profile
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.instructorProfile) {
      return NextResponse.json({ error: 'Profile already exists. Use PATCH to update.' }, { status: 409 })
    }

    const body = await request.json()
    const data = schema.parse(body)

    const profile = await prisma.instructorProfile.create({
      data: {
        userId: user.id,
        rating: data.rating ?? 4.9,
        ...buildProfileData(data),
      },
    })

    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('Error creating profile:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH — update existing profile (or create if none exists)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const data = schema.parse(body)
    const profileData = buildProfileData(data)

    let profile
    if (user.instructorProfile) {
      profile = await prisma.instructorProfile.update({
        where: { id: user.instructorProfile.id },
        data: profileData,
      })
    } else {
      profile = await prisma.instructorProfile.create({
        data: {
          userId: user.id,
          rating: data.rating ?? 4.9,
          ...profileData,
        },
      })
    }

    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('Error saving profile:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data', details: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

// PUT — kept for backward compatibility, same as PATCH
export async function PUT(request: NextRequest) {
  return PATCH(request)
}
