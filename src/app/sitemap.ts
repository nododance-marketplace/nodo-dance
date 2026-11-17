import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { MARKETS } from '@/lib/markets'
import { getAllPosts } from '@/lib/blog'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nododance.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/instructors`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/events`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/cities`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/submit-event`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/become-an-instructor`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ]

  const cityPages: MetadataRoute.Sitemap = MARKETS.map((m) => ({
    url: `${SITE_URL}/cities/${m.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }))

  const blogPosts: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const [instructors, events] = await Promise.all([
    prisma.instructorProfile.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
    }),
    prisma.event.findMany({
      where: { status: 'APPROVED', startDateTime: { gte: now } },
      select: { id: true, updatedAt: true },
      orderBy: { startDateTime: 'asc' },
      take: 5000,
    }),
  ])

  const instructorPages: MetadataRoute.Sitemap = instructors.map((i) => ({
    url: `${SITE_URL}/instructors/${i.slug}`,
    lastModified: i.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const eventPages: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${SITE_URL}/events/${e.id}`,
    lastModified: e.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...cityPages, ...blogPosts, ...instructorPages, ...eventPages]
}
