import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  getAllPosts,
  getPostBySlug,
  getRelatedPosts,
  CATEGORY_LABELS,
  formatDate,
} from '@/lib/blog'
import { Button } from '@/components/ui/button'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://nododance.com'

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return { title: 'Post not found — Nodo Dance' }

  return {
    title: `${post.title} | Nodo Dance Blog`,
    description: post.description,
    keywords: post.tags,
    alternates: {
      canonical: `${SITE_URL}/blog/${post.slug}`,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const related = getRelatedPosts(slug)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      '@type': 'Organization',
      name: 'Nodo Dance',
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Nodo Dance',
      url: SITE_URL,
    },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    keywords: post.tags.join(', '),
  }

  return (
    <div className="page-shell max-w-3xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        All posts
      </Link>

      <article>
        <header className="mb-10">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
            <span className="px-3 py-1 rounded-full bg-surface border border-gray-200 text-gray-700">
              {CATEGORY_LABELS[post.category]}
            </span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingTime} min read</span>
          </div>
          <h1 className="page-heading mb-4">{post.title}</h1>
          <p className="page-intro">{post.description}</p>
        </header>

        <div
          className="prose-blog"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Keep reading</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {related.map((r) => (
              <article key={r.slug} className="bg-surface border border-gray-200 rounded-xl p-5">
                <div className="text-xs text-gray-500 mb-2">{CATEGORY_LABELS[r.category]}</div>
                <h3 className="font-semibold leading-snug mb-3">
                  <Link href={`/blog/${r.slug}`} className="hover:text-primary transition-colors">
                    {r.title}
                  </Link>
                </h3>
                <Link
                  href={`/blog/${r.slug}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Read post
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Internal linking to the product pages */}
      <section className="mt-14 bg-surface border border-gray-200 rounded-xl p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Put it into practice</h2>
        <p className="text-gray-600 mb-5 max-w-lg mx-auto">
          Find socials, classes and workshops near you — and meet the instructors who can
          take you from first step to confident dancer.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/cities">
            <Button variant="gradient">Explore cities</Button>
          </Link>
          <Link href="/instructors">
            <Button variant="outline">Find instructors</Button>
          </Link>
        </div>
      </section>
    </div>
  )
}
