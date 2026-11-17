import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://nododance.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/auth', '/dashboard', '/onboarding', '/launch'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
