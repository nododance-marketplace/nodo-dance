---
name: Context7
description: Fetch up-to-date, version-specific library documentation with the ctx7 CLI instead of relying on training data. Use when writing or debugging code that touches Next.js, React, Prisma, Tailwind, Leaflet, NextAuth, Cloudinary, Zod, react-hook-form, or any other library — especially version-specific APIs, setup/configuration steps, or "how do I do X with library Y" questions.
---

## When to use

Any time a task involves a third-party library or framework API — before writing
code against it. This project runs **Next.js 16 (App Router, `--webpack` builds),
React 18, Prisma 5, NextAuth v4, Tailwind 3** — all of which change faster than
model training data. Prefer real docs over recalled APIs.

## Workflow

1. Resolve the library to its Context7 ID (skip if the user already gave one):

   ```
   npx ctx7 library "next.js" "app router server components"
   ```

2. Fetch the relevant docs with that ID:

   ```
   npx ctx7 docs /vercel/next.js "middleware authentication redirect"
   npx ctx7 docs /prisma/prisma "transaction interactive rollback"
   ```

3. Ground the implementation in what the docs returned. If docs disagree with
   something already in the codebase, surface the conflict instead of silently
   picking one.

## Notes

- Works without an API key (lower rate limits). The owner can raise limits by
  creating a free key at https://context7.com/dashboard and running
  `npx ctx7 setup` once.
- Requires Node ≥ 22.13 (this machine has it).
- If `npx ctx7` fails or is rate-limited, fall back to
  `webfetch` of the official docs page and say so.
