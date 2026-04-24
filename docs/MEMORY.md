# Nodo Dance — Development Handoff

## Quick Reference
- **Stack**: Next.js 16.1.6 (App Router) + React 18.3 + Prisma 5 + PostgreSQL (Neon) + NextAuth v4 + Tailwind 3
- **Build command**: `next build --webpack` (the `--webpack` flag is REQUIRED — see Turbopack section in `build-fixes.md`)
- **Deploy**: Vercel
- **Image hosting**: Cloudinary (event images + instructor photos)
- **DB migrations**: Use `npx prisma db push` (NOT `prisma migrate dev` — see DB section)
- **Build status**: PASSING as of 2026-04-24

## See also
- [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md) — High-level project overview, features, file tree
- [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) — Data flow, auth flow, env vars, setup checklist
- [architecture.md](architecture.md) — Detailed stack, dependencies, file map
- [features.md](features.md) — Feature inventory with implementation notes
- [build-fixes.md](build-fixes.md) — Running list of build/deploy issues and resolutions
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — Full Prisma schema field reference
- [API_REFERENCE.md](API_REFERENCE.md) — All API routes with parameters and responses
- [COMPONENTS.md](COMPONENTS.md) — Component catalog with props and purpose
- [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) — Short/medium/long-term product roadmap
