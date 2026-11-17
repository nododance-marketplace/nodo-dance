import { NextRequest, NextResponse } from 'next/server'
import matter from 'gray-matter'
import slugify from 'slugify'
import { CATEGORY_LABELS, type BlogCategory } from '@/lib/blog'

export const maxDuration = 300
export const runtime = 'nodejs'

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash'
const LLM_PROVIDER = (process.env.BLOG_LLM_PROVIDER || 'gemini').toLowerCase()
const CATEGORIES: BlogCategory[] = ['benefits', 'styles', 'world-dancing']

interface Topic {
  title: string
  category: string
  angle: string
  keywords: string[]
  used?: boolean
  usedOn?: string
}

const GITHUB_API = 'https://api.github.com'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta'

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

async function gh(path: string, init?: RequestInit): Promise<Response> {
  const repo = env('GITHUB_REPO')
  const token = env('GITHUB_TOKEN')
  return fetch(`${GITHUB_API}/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers || {}),
    },
  })
}

async function readFile(path: string): Promise<{ text: string; sha: string } | null> {
  const res = await gh(path)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return { text: Buffer.from(json.content, 'base64').toString('utf8'), sha: json.sha }
}

async function listDir(path: string): Promise<string[]> {
  const res = await gh(path)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`GitHub list failed (${res.status}): ${await res.text()}`)
  const entries = await res.json()
  return entries
    .filter((e: { type: string }) => e.type === 'file')
    .map((e: { name: string }) => e.name)
}

async function commitFile(path: string, content: string, message: string, sha?: string) {
  const res = await gh(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: process.env.GITHUB_BRANCH || 'main',
      ...(sha ? { sha } : {}),
    }),
  })
  if (!res.ok) throw new Error(`GitHub commit failed (${res.status}): ${await res.text()}`)
}

function buildPrompt(topic: Topic, dateStr: string): string {
  return `You are writing a blog post for Nodo Dance (https://nododance.com), a website that helps people find partner-dance socials, classes and instructors in US cities.

Your task: research and write ONE complete blog post on this topic:

Title: ${topic.title}
Category: ${topic.category} (${CATEGORY_LABELS[topic.category as BlogCategory] ?? topic.category})
Angle: ${topic.angle}
Target keywords: ${topic.keywords.join(', ')}

Research first: use web search to gather 3-6 concrete facts, statistics or cultural details that make the post specific and credible. Never invent statistics or studies — if search does not confirm a number, write without it.

Writing rules:
- Write for someone curious about dancing but not yet doing it. Warm, concrete, no fluff.
- Use ## section headers, occasional bullet lists, short paragraphs.
- 900-1400 words.
- End with a short section that naturally points the reader to find events via https://nododance.com/cities or instructors via https://nododance.com/instructors.
- Never mention that you are an AI or that you were given this task.
- British/American spelling: American.

Output format — output ONLY the raw markdown file, no code fences, nothing else. It must start with frontmatter exactly like this:

---
title: "<improved title, max 60 chars>"
description: "<compelling meta description, max 155 chars>"
date: "${dateStr}"
category: ${topic.category}
tags: ["tag1", "tag2", "tag3", "tag4", "tag5"]
---

<the article body>`
}

async function geminiCall(model: string, prompt: string, useSearch: boolean): Promise<string> {
  const apiKey = env('GEMINI_API_KEY')

  const body: Record<string, unknown> = {
    model,
    input: prompt,
    store: false,
    generation_config: { thinking_level: 'low', max_output_tokens: 32768 },
  }
  if (useSearch) body.tools = [{ type: 'google_search' }]

  let text = ''
  let token: string | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    if (token) body.continuation_token = token
    const res = await fetch(`${GEMINI_API}/interactions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Gemini error (${res.status}): ${await res.text()}`)

    const json = await res.json()
    text += ((json.steps || []) as Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>)
      .filter((s) => s.type === 'model_output')
      .flatMap((s) => s.content || [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('')
    token = json.continuation_token
    if (json.status !== 'requires_continuation' || !token) break
  }
  return text.trim()
}

// Try smarter models first with live search, then degrade: ungrounded on the
// same model (quota/demand fallback), then lighter models that stay available.
const GEMINI_FALLBACK_MODELS = [
  GEMINI_MODEL,
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
]

async function writePostWithGemini(prompt: string): Promise<string> {
  let lastError: unknown
  for (const model of GEMINI_FALLBACK_MODELS) {
    for (const useSearch of [true, false]) {
      try {
        const text = await geminiCall(model, prompt, useSearch)
        if (!text) throw new Error('Gemini returned no text')
        return text
      } catch (err) {
        lastError = err
        const msg = String(err instanceof Error ? err.message : err)
        const retryableWithoutSearch =
          useSearch &&
          /too_many_requests|service_unavailable|quota|google_search|web_search|tool/i.test(msg)
        if (retryableWithoutSearch) continue
        break
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function writePostWithAnthropic(prompt: string): Promise<string> {
  const apiKey = env('ANTHROPIC_API_KEY')

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 20000,
    messages: [{ role: 'user', content: prompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
  }

  let res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  // Some API tiers reject the web search tool — degrade gracefully.
  if (res.status === 400) {
    const errText = await res.text()
    if (/web_search|tool/i.test(errText)) {
      res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ...body, tools: undefined }),
      })
    } else {
      throw new Error(`Anthropic error: ${errText}`)
    }
  }
  if (!res.ok) throw new Error(`Anthropic error (${res.status}): ${await res.text()}`)

  const json = await res.json()
  const textBlock = (json.content || []).find((b: { type: string }) => b.type === 'text')
  if (!textBlock) throw new Error('Anthropic returned no text block')
  return textBlock.text.trim()
}

function stripFences(raw: string): string {
  const fence = raw.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/)
  return fence ? fence[1] : raw
}

function validatePost(raw: string, topic: Topic): { frontmatter: string; body: string; slug: string } {
  const cleaned = stripFences(raw)
  const parsed = matter(cleaned)
  const { data, content } = parsed

  const title = typeof data.title === 'string' ? data.title.trim() : ''
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  const category = String(data.category || '').trim()

  if (!title || title.length > 70) throw new Error(`Invalid title: "${title}"`)
  if (!description || description.length > 165) throw new Error(`Invalid description: "${description}"`)
  if (!CATEGORIES.includes(category as BlogCategory)) throw new Error(`Invalid category: ${category}`)
  if (content.trim().length < 3500) throw new Error(`Post too short: ${content.trim().length} chars`)
  if (/```|claude|as an ai/i.test(content)) throw new Error('Post contains suspicious artifacts')

  const slug = slugify(title, { lower: true, strict: true }).slice(0, 80)
  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: "${data.date ?? new Date().toISOString().slice(0, 10)}"
category: ${category}
tags: ${JSON.stringify(Array.isArray(data.tags) ? data.tags.slice(0, 8) : [])}
---`

  return { frontmatter, body: content.trim(), slug }
}

export async function GET(req: NextRequest) {
  try {
    const secret = env('CRON_SECRET')
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (process.env.BLOG_DAILY_ENABLED === 'false') {
      return NextResponse.json({ status: 'skipped', reason: 'BLOG_DAILY_ENABLED is false' })
    }

    const topicsPath = 'data/blog-topics.json'
    const postsDir = 'content/blog'
    const dateStr = new Date().toISOString().slice(0, 10)

    const topicsFile = await readFile(topicsPath)
    if (!topicsFile) throw new Error('data/blog-topics.json not found in repo')
    const topics: Topic[] = JSON.parse(topicsFile.text)

    const existing = await listDir(postsDir)
    const usedSlugs = new Set(existing.map((f) => f.replace(/\.mdx?$/, '').toLowerCase()))

    const topic = topics.find(
      (t) => !t.used && !usedSlugs.has(slugify(t.title, { lower: true, strict: true }).slice(0, 80)),
    )
    if (!topic) {
      return NextResponse.json({ status: 'done', reason: 'No unused topics left in the pool' })
    }

    const prompt = buildPrompt(topic, dateStr)
    const writePost = LLM_PROVIDER === 'anthropic' ? writePostWithAnthropic : writePostWithGemini
    const raw = await writePost(prompt)
    const { frontmatter, body, slug } = validatePost(raw, topic)

    if (usedSlugs.has(slug)) {
      return NextResponse.json({ status: 'skipped', reason: `Post already exists: ${slug}` })
    }

    const fileContent = `${frontmatter}\n\n${body}\n`
    await commitFile(`${postsDir}/${slug}.md`, fileContent, `blog: add "${topic.title}"`)

    topic.used = true
    topic.usedOn = dateStr
    await commitFile(topicsPath, JSON.stringify(topics, null, 2), `blog: mark topic used (${slug})`, topicsFile.sha)

    return NextResponse.json({ status: 'published', slug, title: topic.title })
  } catch (err) {
    console.error('[blog-daily]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
