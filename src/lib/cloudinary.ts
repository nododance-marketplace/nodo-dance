import { v2 as cloudinary } from 'cloudinary'

// Validate env vars at import time (cold start)
const REQUIRED_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const

const missing = REQUIRED_VARS.filter((v) => !process.env[v])
if (missing.length > 0) {
  console.error(`[CLOUDINARY] FATAL: Missing env vars: ${missing.join(', ')}. Image uploads WILL NOT work.`)
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type UploadPreset = 'profile-photo' | 'event-image'

const PRESETS: Record<UploadPreset, { folder: string; transformation: object[] }> = {
  'profile-photo': {
    folder: 'nodo-dance/instructors',
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' },
    ],
  },
  'event-image': {
    folder: 'nodo-dance/events',
    transformation: [
      { width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
    ],
  },
}

/**
 * Validates and uploads a File to Cloudinary.
 * Returns the secure URL of the uploaded (and transformed) image.
 */
export async function uploadImage(file: File, preset: UploadPreset): Promise<string> {
  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new UploadError('Invalid file type. Only JPG, PNG, and WebP allowed.', 400)
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError('File too large. Max size is 5MB.', 400)
  }

  const { folder, transformation } = PRESETS[preset]

  // Convert File to base64 data URI for Cloudinary's upload API
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const dataUri = `data:${file.type};base64,${base64}`

  console.log(`[CLOUDINARY] Uploading ${preset} (${file.name}, ${(file.size / 1024).toFixed(0)}KB) to ${folder}`)

  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    transformation,
    resource_type: 'image',
  })

  console.log(`[CLOUDINARY] Upload success: ${result.public_id} (${result.width}x${result.height}, ${result.bytes} bytes)`)

  return result.secure_url
}

export class UploadError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
