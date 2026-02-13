import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { nanoid } from 'nanoid'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'instructors')

export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse form data
    const formData = await request.formData()
    const file = formData.get('photo') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // 3. Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPG, and WebP allowed.' },
        { status: 400 }
      )
    }

    // 4. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Max size is 5MB.' },
        { status: 400 }
      )
    }

    // 5. Create upload directory if it doesn't exist
    await mkdir(UPLOAD_DIR, { recursive: true })

    // 6. Generate unique filename
    const fileExt = path.extname(file.name)
    const uniqueId = nanoid(10)
    const filename = `${uniqueId}${fileExt}`
    const filepath = path.join(UPLOAD_DIR, filename)

    // 7. Write file
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    // 8. Return public URL
    const publicUrl = `/uploads/instructors/${filename}`
    return NextResponse.json({ url: publicUrl })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
