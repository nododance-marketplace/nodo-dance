import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'events')

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPG, and WebP allowed.' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Max size is 5MB.' },
        { status: 400 }
      )
    }

    // Create upload directory if it doesn't exist
    await mkdir(UPLOAD_DIR, { recursive: true })

    // Generate unique filename
    const fileExt = path.extname(file.name) || '.jpg'
    const uniqueId = nanoid(10)
    const filename = `${uniqueId}${fileExt}`
    const filepath = path.join(UPLOAD_DIR, filename)

    // Write file
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    // Return public URL
    const publicUrl = `/uploads/events/${filename}`
    return NextResponse.json({ url: publicUrl })
  } catch (error: any) {
    console.error('Event image upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
