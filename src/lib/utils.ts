import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'Free'
  return `$${amount}`
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} at ${formatTime(date)}`
}

/**
 * Get event type label with backwards compatibility for old SOCIAL_MILONGA values
 * Maps SOCIAL_MILONGA to either TANGO_MILONGA or SOCIAL based on styles
 */
export function getEventTypeValue(eventType: string, styles?: string | string[]): string {
  // Handle backwards compatibility: SOCIAL_MILONGA -> TANGO_MILONGA or SOCIAL
  if (eventType === 'SOCIAL_MILONGA') {
    const styleArray = Array.isArray(styles) ? styles : parseJsonArray(styles)
    return styleArray.includes('Tango') ? 'TANGO_MILONGA' : 'SOCIAL'
  }
  return eventType
}

/**
 * Extract Instagram handle from URL or @handle input
 * @param input - Instagram URL, @handle, or plain handle
 * @returns Clean handle without @ symbol, or null if invalid
 */
export function extractInstagramHandle(input: string | null | undefined): string | null {
  if (!input) return null

  // Remove @ if present
  let handle = input.replace('@', '').trim()

  // Extract from URL if full URL provided
  if (handle.includes('instagram.com/')) {
    const match = handle.match(/instagram\.com\/([^/?]+)/)
    handle = match ? match[1] : handle
  }

  return handle || null
}

/**
 * Convert YouTube URL to embed URL
 * @param url - YouTube watch URL or short URL
 * @returns Embed URL or null if invalid
 */
export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    // Match various YouTube URL formats
    const videoIdMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?/]+)/)
    if (videoIdMatch?.[1]) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`
    }
  } catch (e) {
    return null
  }

  return null
}
