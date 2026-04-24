# Nodo Dance — Architecture & Project Structure

> Detailed stack, dependency pins, and file map. Last updated: 2026-04-24.

## Overview
Nodo Dance is a partner dance community platform for Charlotte, NC. It connects dance instructors (supply) with dancers (demand), and hosts a community events calendar with calendar / list / map views.

## Tech Stack (exact versions from `package.json`)

### Runtime Dependencies
| Package | Version | Notes |
|---------|---------|-------|
| next | ^16.1.6 | App Router. MUST use `--webpack` flag for builds |
| react / react-dom | ^18.3.0 | Next 16 peer deps allow React 18 |
| next-auth | ^4.24.13 | v4, NOT v5. Uses `@next-auth/prisma-adapter` |
| @next-auth/prisma-adapter | ^1.0.7 | NOT `@auth/prisma-adapter` (that's Auth.js v5) |
| @prisma/client | ^5.11.0 | PostgreSQL (Neon) |
| prisma | ^5.11.0 | CLI (dev dep) |
| leaflet | ^1.9.4 | Map tiles (OSM) |
| react-leaflet | **^4.2.1** | MUST be v4, NOT v5. v5 requires React 19 → ERESOLVE on Vercel |
| next-pwa | ^5.6.0 | PWA support. Adds webpack config → requires `--webpack` flag |
| react-hook-form | ^7.51.0 | Form management |
| @hookform/resolvers | ^3.3.4 | Zod integration |
| zod | ^3.22.4 | Validation |
| sonner | ^2.0.7 | Toast notifications |
| date-fns | ^3.3.1 | Calendar utilities |
| nanoid | ^5.1.6 | Unique IDs |
| nodemailer | ^7.0.13 | Email (magic links, admin notifications) |
| cloudinary | ^2.9.0 | Image hosting (event images, profile photos) |
| lru-cache | ^10.2.0 | Rate limit in-memory tier |
| lucide-react | ^0.358.0 | Icon library |
| clsx | ^2.1.0 | Classname helper |
| tailwind-merge | ^2.2.1 | Tailwind class dedup |
| slugify | ^1.6.6 | Slug generation for instructor profiles |

### Dev Dependencies
| Package | Version |
|---------|---------|
| typescript | ^5.4.0 |
| @types/leaflet | ^1.9.14 |
| @types/node | ^20.11.0 |
| @types/nodemailer | ^6.4.14 |
| @types/react / @types/react-dom | ^18.2.0 |
| eslint | ^9.39.2 |
| eslint-config-next | ^16.1.6 |
| tailwindcss | ^3.4.0 |
| autoprefixer | ^10.4.0 |
| postcss | ^8.4.0 |
| tsx | ^4.7.1 |

### Scripts
```json
"dev":       "next dev --webpack"
"build":     "next build --webpack"
"start":     "next start"
"lint":      "next lint"
"db:push":   "prisma db push"
"db:studio": "prisma studio"
"db:seed":   "tsx prisma/seed.ts"
"postinstall": "prisma generate"
```

---

## Database

### Provider
- **PostgreSQL on Neon** (serverless)
- Schema file: `prisma/schema.prisma`
- Connection: `DATABASE_URL` (pooled) + `DIRECT_URL` (non-pooled, for migrations)

### CRITICAL: Migration approach
- Old migration history was SQLite. Project migrated to PostgreSQL.
- `prisma migrate dev` FAILS with `P3019` (provider mismatch in `migration_lock.toml`)
- **Always use `npx prisma db push`** for schema changes
- The `prisma/migrations/` directory contains stale SQLite migrations — do NOT delete without understanding implications

### CRITICAL: .env `DIRECT_URL`
- The DIRECT_URL was previously malformed (`psql 'postgresql://...'` with psql prefix and quotes)
- It was fixed to just `postgresql://...` — if deployment fails with `P1013`, check this first

### Data Models
See `docs/DATABASE_SCHEMA.md` for complete field-by-field reference.

- **User**: id, email, role (`DANCER`|`INSTRUCTOR`), relations to InstructorProfile?, submittedEvents[], savedInstructors[], savedEvents[]
- **InstructorProfile**: slug, displayName, styles (JSON array string), `otherStyle`, pricing, location, social links, `isDJ`, `djStyles`, contact fields (soft-gated)
- **Event**: title, eventType, styles (JSON array string), `otherStyle`, startDateTime, venueName, address, lat?, lng?, status (PENDING|APPROVED|REJECTED), imageUrl?, submittedByUserId?, recurrence fields
- **SavedInstructor / SavedEvent**: bookmark join tables (unique compound keys)
- **LessonRequest**: student→instructor contact
- **RateLimitEntry**: IP-based rate limiting
- Standard NextAuth: `Account`, `Session`, `VerificationToken`

### Important: JSON Array Fields
- `styles` on both Event and InstructorProfile is a `String` containing a JSON array: `'["Salsa","Bachata"]'`
- Same shape used for `skillLevels`, `offerings`, `languages`, `djStyles`
- Use `parseJsonArray()` from `src/lib/utils.ts` to safely parse
- Note: PostgreSQL's `contains` is case-sensitive (no `mode: 'insensitive'` option is used, and SQLite dev DB doesn't support it anyway)

---

## File Structure

### Pages (App Router)
```
src/app/
├── layout.tsx                          # Root layout (Leaflet CSS via CDN link)
├── globals.css                         # Tailwind base
├── page.tsx                            # Homepage (hero, How It Works, 11 styles grid, CTAs)
├── account/page.tsx                    # Dancer dashboard (saved events/instructors, settings)
├── admin/
│   ├── page.tsx                        # Admin gate (checks isAdmin)
│   └── admin-panel.tsx                 # Client UI for event/profile moderation
├── auth/
│   ├── signin/page.tsx                 # Magic link + Google sign-in (Suspense wrapped)
│   ├── verify/page.tsx                 # "Check your email" page
│   └── error/page.tsx                  # Auth error page
├── become-an-instructor/page.tsx       # Upgrade path
├── dashboard/page.tsx                  # Pure redirect based on role
├── events/
│   ├── page.tsx                        # Events listing (Calendar|List|Map views; Suspense wrapped)
│   └── [id]/page.tsx                   # Event detail (Promise params for Next 16)
├── instructor/
│   ├── dashboard/page.tsx              # Instructor dashboard
│   └── profile/edit/page.tsx           # Profile editor
├── instructors/
│   ├── page.tsx                        # Instructor directory
│   └── [slug]/page.tsx                 # Instructor profile (Promise params for Next 16)
├── onboarding/page.tsx                 # Role picker for new users
└── submit-event/page.tsx               # Event submission form (soft-gated)
```

### API Routes
```
src/app/api/
├── account/route.ts                    # DELETE: delete account + cascade all user data
├── admin/
│   ├── events/route.ts                 # GET list / PUT approve-reject/geocode / DELETE
│   └── profiles/route.ts               # GET list / DELETE instructor profile
├── auth/[...nextauth]/route.ts         # NextAuth handler
├── events/
│   ├── route.ts                        # GET (mapMode, dateFilter, monthRange, styles, search)
│   ├── my/route.ts                     # GET current user's submitted events
│   └── submit/route.ts                 # POST/PUT/DELETE (supports series editSeries/deleteSeries)
├── instructor-profile/route.ts         # Profile create/upsert
├── instructors/route.ts                # GET directory (soft-gated contactEmail)
├── lesson-requests/route.ts            # POST lesson request (honeypot + rate limit)
├── saved/
│   ├── event/route.ts                  # GET ids + POST toggle
│   └── instructor/route.ts             # GET ids + POST toggle
├── upload/
│   ├── event-image/route.ts            # POST Cloudinary upload (event)
│   └── profile-photo/route.ts          # POST Cloudinary upload (instructor photo)
└── user/role/route.ts                  # PUT user role (DANCER↔INSTRUCTOR)
```

See `docs/API_REFERENCE.md` for full parameter and response specs.

### Key Components
```
src/components/
├── account/
│   └── account-dashboard.tsx           # Dancer saved items + settings
├── auth/
│   ├── danger-zone.tsx                 # Delete account section
│   ├── delete-account-modal.tsx        # Confirmation modal
│   ├── event-gate-modal.tsx            # Soft gate for event submission
│   ├── login-prompt-card.tsx           # Generic login prompt
│   ├── onboarding-picker.tsx           # DANCER/INSTRUCTOR role picker
│   ├── save-button.tsx                 # Bookmark toggle (heart)
│   ├── sign-out-button.tsx             # Sign out
│   └── upgrade-button.tsx              # Upgrade to INSTRUCTOR
├── dashboard/
│   ├── dashboard-view.tsx              # Instructor dashboard
│   └── profile-editor.tsx              # Legacy alias
├── events/
│   ├── event-card.tsx                  # Comfortable card
│   ├── event-card-compact.tsx          # 2-col grid card
│   ├── event-card-tile.tsx             # Single-row tile
│   ├── event-details-view.tsx          # Event detail body
│   ├── events-map-view.tsx             # Leaflet map (dynamic import, ssr:false)
│   └── events-month-calendar.tsx       # Month grid
├── instructors/
│   ├── instructor-card.tsx             # Comfortable card
│   ├── instructor-card-compact.tsx     # 2-col grid card
│   ├── instructor-card-tile.tsx        # Single-row tile
│   ├── instructor-profile-view.tsx     # Public profile
│   ├── instructor-profile-editor.tsx   # Edit form
│   └── lesson-request-modal.tsx        # Contact modal
├── layout/
│   ├── header.tsx                      # Top nav (role-aware)
│   ├── footer.tsx                      # Footer (IG @nododance, nododance@gmail.com)
│   └── mobile-nav.tsx                  # Mobile bottom nav
├── providers/
│   └── session-provider.tsx            # NextAuth SessionProvider wrapper
├── ui/
│   ├── animated-nodes.tsx              # Hero animation
│   ├── badge.tsx                       # Label badge
│   ├── button.tsx                      # Variants: default / gradient / outline
│   ├── card.tsx                        # Card wrapper
│   ├── input.tsx                       # Text input
│   ├── select.tsx                      # Select dropdown
│   └── textarea.tsx                    # Text area
└── view-mode-toggle.tsx                # 3-mode density switcher
```

### Lib
```
src/lib/
├── auth.ts                             # NextAuth config + isAdmin() + getDashboardUrl()
├── calendar-utils.ts                   # getCalendarDays / groupEventsByDate / month helpers
├── cloudinary.ts                       # uploadImage() + UploadError + validation
├── constants.ts                        # DANCE_STYLES, EVENT_TYPES, SKILL_LEVELS, LOCATION_TYPES, LESSON_TYPES, INSTRUCTOR_OFFERINGS, LANGUAGES
├── email.ts                            # sendLessonRequestEmail / sendEventSubmissionEmail
├── geocode.ts                          # geocodeAddress / sanitizeAddress / buildGeoQuery
├── prisma.ts                           # Prisma client singleton
├── rate-limit.ts                       # checkRateLimit / getClientIp (LRU + DB)
├── styleColors.ts                      # DANCE_STYLE_COLORS + getStyleColor + hexToRgba
├── useViewMode.ts                      # React hook for view density preference
└── utils.ts                            # cn, parseJsonArray, formatDate/Time, toDateInputValue/toTimeInputValue, APP_TIMEZONE, getEventTypeValue, extractInstagramHandle, getYouTubeEmbedUrl, formatCurrency
```

### Scripts
```
scripts/
├── extend-recurring-events.ts          # Extend a series by N weeks (dry-run by default)
├── generate-favicons.mjs               # Rebuild favicon set
└── migrate-timezone.ts                 # Backfill pre-parseAsET events
```

---

## Authentication Flow
1. User enters email on `/auth/signin` (or clicks Google)
2. NextAuth sends magic link via Nodemailer SMTP (custom HTML template)
3. User clicks link → `/api/auth/callback/email` → `/onboarding`
4. If new user (default role=`DANCER`): shows role picker; `PUT /api/user/role` persists choice
5. If INSTRUCTOR: redirects to `/instructor/dashboard`
6. `/dashboard` is a pure redirect using `getDashboardUrl(user.role)`

## Role System
- Default role: `DANCER` (Prisma schema default)
- Upgrade path: DANCER → INSTRUCTOR via `/become-an-instructor` or account settings
- API: `PUT /api/user/role` with `{ role: "INSTRUCTOR" }`
- Header nav routes based on role
- `getDashboardUrl(role)` helper in `src/lib/auth.ts`

## Configuration Files

### `next.config.js`
- Wraps `next-pwa` with defaults (disabled in dev)
- `images.remotePatterns`: allows all HTTPS hostnames (Cloudinary URLs)

### `tailwind.config.ts`
- Primary palette: `#1B1F3B` / `#2D3354` (light) / `#0F1123` (dark)
- Accents: coral `#FF6F61`, magenta `#C2185B`, orange `#FF8C42`
- Background: `#F2F2F2`
- Fonts: Satoshi via `var(--font-satoshi)`

### `vercel.json`
- Permanent 301 redirect `nodo-dance.vercel.app/*` → `nododance.com/*`

### `tsconfig.json`
- Path alias `@/*` → `./src/*`
- Next.js 16 compatible TypeScript config

### `.env.example`
Keys listed in `docs/SYSTEM_OVERVIEW.md`.
