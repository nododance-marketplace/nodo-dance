import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, BookOpen } from 'lucide-react'
import { getAllPosts, CATEGORY_LABELS, formatDate, type BlogCategory } from '@/lib/blog'
import { Button } from '@/components/ui/button'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nododance.com'

export const metadata: Metadata = {
  title: 'Dance Blog — Benefits, Styles & Dancing Around the World | Nodo Dance',
  description:
    'Guides on the benefits of social dancing, deep dives into salsa, bachata, kizomba, tango and more, and how partner dancing lives in different cultures around the world.',
  openGraph: {
    title: 'Dance Blog — Benefits, Styles & Dancing Around the World | Nodo Dance',
    description:
      'Guides on the benefits of social dancing, deep dives into partner dance styles, and dancing cultures around the world.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()
  const categories = Object.keys(CATEGORY_LABELS) as BlogCategory[]

  return (
    <div className="page-shell">
      {/* Hero */}
      <section className="mb-12">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
          <span>Blog</span>
        </div>
        <h1 className="page-heading mb-3">Why we dance</h1>
        <p className="page-intro max-w-2xl mb-6">
          Stories and guides about partner dancing — what it does for your body and mind,
          the styles you can learn, and how cultures around the world dance.
        </p>
      </section>

      {/* Category anchors */}
      <div className="flex flex-wrap gap-2 mb-10">
        {categories.map((c) => (
          <span key={c} className="px-3 py-1 rounded-full bg-surface border border-gray-200 text-sm text-gray-700">
            {CATEGORY_LABELS[c]}
          </span>
        ))}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <p className="text-gray-600">No posts yet — check back soon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <article
              key={post.slug}
              className="bg-surface border border-gray-200 rounded-xl p-5 flex flex-col"
            >
              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span className="px-2 py-0.5 rounded-full bg-surface border border-gray-200 text-gray-700 font-medium">
                  {CATEGORY_LABELS[post.category]}
                </span>
                <time dateTime={post.date}>{formatDate(post.date)}</time>
              </div>
              <h2 className="font-semibold text-lg leading-snug mb-2">
                <Link href={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
                  {post.title}
                </Link>
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4 flex-1">
                {post.description}
              </p>
              <Link href={`/blog/${post.slug}`} className="mt-auto inline-flex">
                <Button variant="outline" size="sm">
                  Read post
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
