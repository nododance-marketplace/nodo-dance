import { LRUCache } from 'lru-cache'
import { prisma } from './prisma'

// In-memory cache for development
const cache = new LRUCache<string, { count: number; resetAt: number }>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour
})

interface RateLimitOptions {
  identifier: string // IP or email
  action: string
  limit: number
  window: number // in seconds
}

export async function checkRateLimit(options: RateLimitOptions): Promise<boolean> {
  const { identifier, action, limit, window } = options
  const key = `${identifier}:${action}`

  // Try in-memory first (fast for dev)
  const cached = cache.get(key)
  const now = Date.now()

  if (cached) {
    if (cached.resetAt > now) {
      if (cached.count >= limit) {
        return false // Rate limited
      }
      cached.count++
      cache.set(key, cached)
      return true
    }
  }

  // Fallback to database (for production persistence)
  try {
    const windowStart = new Date(now - window * 1000)

    const entry = await prisma.rateLimitEntry.upsert({
      where: {
        identifier_action: {
          identifier,
          action,
        },
      },
      update: {
        count: {
          increment: 1,
        },
      },
      create: {
        identifier,
        action,
        count: 1,
        windowStart: new Date(),
      },
    })

    // Reset if window expired
    if (entry.windowStart < windowStart) {
      await prisma.rateLimitEntry.update({
        where: { id: entry.id },
        data: {
          count: 1,
          windowStart: new Date(),
        },
      })

      cache.set(key, { count: 1, resetAt: now + window * 1000 })
      return true
    }

    // Check limit
    if (entry.count > limit) {
      return false
    }

    cache.set(key, { count: entry.count, resetAt: now + window * 1000 })
    return true
  } catch (error) {
    console.error('Rate limit check failed:', error)
    // Fail open to not block legitimate users
    return true
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return ip
}
