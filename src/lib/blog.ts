import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { remark } from 'remark'
import html from 'remark-html'

export type BlogCategory = 'benefits' | 'styles' | 'world-dancing'

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  date: string
  category: BlogCategory
  tags: string[]
  readingTime: number
}

export interface BlogPost extends BlogPostMeta {
  contentHtml: string
}

const contentDir = path.join(process.cwd(), 'content', 'blog')

export const CATEGORY_LABELS: Record<BlogCategory, string> = {
  benefits: 'Benefits of Dancing',
  styles: 'Dance Styles',
  'world-dancing': 'Dancing Around the World',
}

function readingTimeMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

function parsePost(slug: string, raw: string): BlogPostMeta & { markdown: string } {
  const { data, content } = matter(raw)
  return {
    slug,
    title: data.title ?? slug,
    description: data.description ?? '',
    date: data.date ? new Date(data.date).toISOString() : new Date().toISOString(),
    category: (data.category ?? 'styles') as BlogCategory,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    readingTime: readingTimeMinutes(content),
    markdown: content,
  }
}

export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(contentDir)) return []
  const files = fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))

  return files
    .map((f) => {
      const slug = f.replace(/\.mdx?$/, '')
      const raw = fs.readFileSync(path.join(contentDir, f), 'utf8')
      return parsePost(slug, raw)
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const mdPath = path.join(contentDir, `${slug}.md`)
  const mdxPath = path.join(contentDir, `${slug}.mdx`)
  const filePath = fs.existsSync(mdPath) ? mdPath : fs.existsSync(mdxPath) ? mdxPath : null
  if (!filePath) return null

  const parsed = parsePost(slug, fs.readFileSync(filePath, 'utf8'))
  const processed = await remark().use(html).process(parsed.markdown)

  return {
    ...parsed,
    contentHtml: processed.toString(),
  }
}

export function getPostsByCategory(category: BlogCategory): BlogPostMeta[] {
  return getAllPosts().filter((p) => p.category === category)
}

export function getRelatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  return getAllPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, limit)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
