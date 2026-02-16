import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadImage, UploadError } from '@/lib/cloudinary'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const url = await uploadImage(file, 'event-image')
    return NextResponse.json({ url })
  } catch (error: any) {
    console.error('[UPLOAD] Event image error:', error)
    const status = error instanceof UploadError ? error.status : 500
    const message = error instanceof UploadError ? error.message : 'Failed to upload file'
    return NextResponse.json({ error: message }, { status })
  }
}
