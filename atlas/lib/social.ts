/**
 * Finding a studio's social accounts from its own website.
 *
 * Almost every studio links to its Instagram and Facebook from its own
 * site, and those links are the answer to "where does this studio post
 * its events?" — the long tail of small-town studios has an Instagram
 * account and no website, so this is how we find the ones we cannot crawl.
 *
 * It is also the honest record of where an event came from: a listing
 * posted on Instagram points back at that post.
 *
 * We read the links a studio puts on its own site. We do not read the
 * platform, and we never log in.
 */

const SOCIAL_PLATFORMS = [
  { platform: 'instagram', host: /instagram\.com/i, profile: /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|stories\/|accounts\/)[A-Za-z0-9._]+/i },
  { platform: 'facebook', host: /facebook\.com/i, profile: /https?:\/\/(?:www\.)?facebook\.com\/(?!2008\/|sharer|share|plugins|tr\?)[A-Za-z0-9.\-]+/i },
  { platform: 'tiktok', host: /tiktok\.com/i, profile: /https?:\/\/(?:www\.)?tiktok\.com\/@?[A-Za-z0-9._]+/i },
  { platform: 'youtube', host: /youtube\.com/i, profile: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/)?[A-Za-z0-9._\-]+/i },
  { platform: 'x', host: /(?:twitter|x)\.com/i, profile: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent\/|share|home)[A-Za-z0-9._]+/i },
]

/**
 * Accounts that belong to the website platform rather than the studio.
 * "squarespace" on a Squarespace site is the builder, not the school.
 */
const PLATFORM_DEFAULTS = [
  'squarespace', 'wix', 'wixsite', 'weebly', 'wordpress', 'godaddy', 'facebook',
  'instagram', 'twitter', 'tiktok', 'youtube', 'google', 'shopify', 'bigcartel',
  'linktree', 'linkin', 'pinterest', 'yelp', 'tripadvisor', 'vimeo', 'stripe',
  'paypal', 'venmo', 'square', 'mailchimp', 'hubspot', 'eventbrite', 'shotgun',
]

export interface SocialLink {
  platform: string
  url: string
}

function isPlatformDefault(url: string): boolean {
  const handle = url.split('/').filter(Boolean).pop() ?? ''
  const clean = handle.replace(/^@/, '').toLowerCase()
  if (!clean) return true
  return PLATFORM_DEFAULTS.includes(clean)
}

/**
 * The social accounts a page links to.
 *
 * Only profile links count: a post, a share button or a platform namespace
 * is not an account.
 */
export function findSocialLinks(html: string): SocialLink[] {
  const found = new Map<string, SocialLink>()

  const urls = html.match(/https?:\/\/[^\s"'<>)\]]+/gi) ?? []
  for (const raw of urls) {
    const url = raw.replace(/[.,;:)]+$/, '')
    for (const { platform, host, profile } of SOCIAL_PLATFORMS) {
      if (!host.test(url)) continue
      const m = profile.exec(url)
      if (!m) continue
      const matched = m[0]
      if (isPlatformDefault(matched)) continue
      // The same account is often linked twice, once over http.
      const key = `${platform}:${matched.toLowerCase().replace(/^https?:\/\/(www\.)?/, '')}`
      if (found.has(key)) continue
      found.set(key, { platform, url: matched.replace(/^http:\/\//i, 'https://') })
      break
    }
  }

  return [...found.values()]
}

/** The social accounts as a JSON string, for a column. */
export function socialLinksToJson(links: SocialLink[]): string | null {
  if (links.length === 0) return null
  return JSON.stringify(links)
}
