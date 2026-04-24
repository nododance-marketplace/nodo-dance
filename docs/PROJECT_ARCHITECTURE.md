# Nodo Dance — Project Architecture

> Last updated: 2026-04-24 | Build status: PASSING | Branch: `main`

## 1. App Overview

Nodo Dance is a community platform for partner dance — connecting students with instructors and surfacing local dance events (socials, classes, workshops, festivals) in a unified calendar/list/map interface. Currently focused on Charlotte, NC with architecture designed for multi-city expansion.

### User Types

| Role | Capabilities |
|------|-------------|
| **Visitor** (not logged in) | Browse events, view instructor profiles (contact email gated), view public socials/links |
| **Dancer** (logged in, default role) | Save events/instructors, see instructor contact emails, submit events, request lessons |
| **Instructor** (upgraded from Dancer) | All Dancer abilities + manage instructor profile, receive lesson requests |
| **Admin** (via `ADMIN_EMAILS` env) | Approve/reject events, geocode addresses, manage profiles, bulk re-geocode, full data access |

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router) |
| UI | React 18.3 + Tailwind CSS 3.4 |
| Database | PostgreSQL on Neon |
| ORM | Prisma 5.11 |
| Auth | NextAuth v4.24 (Google OAuth + Magic Links) |
| Maps | react-leaflet 4.2 + Leaflet 1.9 + OpenStreetMap tiles |
| Geocoding | OpenStreetMap Nominatim (free, no API key) |
| File Storage | Cloudinary (event images 1600w max, profile photos 512×512 face-cropped) |
| Email | Nodemailer 7 (SMTP) |
| Forms / Validation | react-hook-form 7 + Zod 3 |
| Notifications | Sonner (toast) |
| Rate Limiting | LRU cache + Prisma-backed `RateLimitEntry` |
| Deployment | Vercel (serverless) |
| PWA | next-pwa 5 (service worker, manifest) |
| Build | `next build --webpack` (Turbopack incompatible with next-pwa) |

---

## 2. Core Features Implemented

### Events System
- **Submit events** with title, type, styles (multi), date/time, venue, address, price, description, image
- **Other style** free-text field appears when "Other" is selected (event + instructor)
- **Recurring events**: weekly or biweekly, 2–52 occurrences, grouped by `recurrenceGroupId`
- **Series edits**: admin or owner can edit shared fields across all occurrences (dates preserved)
- **Series delete**: owner or admin can delete the whole series via `deleteSeries` flag
- **Three views**: Calendar (month grid), List (three densities), Map (Leaflet markers)
- **View densities** (list): Comfortable (cards), Compact (2-col grid), Tile (single-line rows) — persisted via localStorage key `nodo-events-density`
- **Filters**: by dance style, event type, date range (Today/This Week/This Month), search text (title/venue/address)
- **Admin approval**: events start as `PENDING`, admin approves/rejects from admin panel; bulk series approval supported
- **Geocoding**: address geocoded on submit with automatic fallback (strips suite/unit tokens); admin can re-geocode single event or bulk re-geocode
- **Image upload**: event flyers via Cloudinary (JPEG/PNG/WebP, max 5MB, limited to 1600px wide)
- **Rate limit**: 10 submissions / IP / hour (bypassed for admins; toggle via `EVENT_RATE_LIMIT_ENABLED=false`)
- **Honeypot** field on submit form to reduce bot submissions

### Instructor Profiles
- **Public directory**: searchable/filterable by style, lesson type, location type, price range, DJ-only, sort (recommended / price-low / price-high / most-styles)
- **Profile fields**: display name, headline, bio, photo, styles (with `otherStyle` free text), skill levels, offerings, languages, certifications, years teaching, students taught, rating (placeholder 4.9), pricing (private/group), location type, neighborhood/address/travel radius, payment methods (cash/Venmo/CashApp/PayPal), contact info, DJ flag + DJ styles, social links (Instagram/website/booking/YouTube/TikTok)
- **Soft-gated contact**: `contactEmail` and `contactNotes` visible only to logged-in users; server-side redaction via `select` projection in `/api/instructors`
- **Contact flow**: "Email Instructor" (mailto with prefilled subject) + "Copy Email" button
- **Lesson request modal**: fallback for instructors without `contactEmail` set; rate-limited 5/hr/IP, honeypot-protected
- **Booking URL**: external link support (Calendly, etc.)
- **View densities** (directory): persisted via localStorage key used by `useViewMode`

### Authentication
- **Google OAuth**: one-click sign in (only loaded when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set)
- **Magic link email**: passwordless email sign in via Nodemailer SMTP
- **Role system**: `DANCER` (default) → `INSTRUCTOR` (upgrade via "Become an Instructor" flow)
- **Onboarding**: after sign-in, redirected to `/onboarding` (role picker) — redirects out if role already chosen
- **Admin**: determined by `ADMIN_EMAILS` environment variable (comma-separated, trimmed)
- **Session strategy**: database-backed (Prisma adapter), 30-day max age

### Timezone Handling
- **All dates stored as UTC** in PostgreSQL
- **User input interpreted as America/New_York** via `parseAsET()` helper
- **Display always uses** `timeZone: 'America/New_York'` in formatting functions (`APP_TIMEZONE` constant)
- **Edit mode** uses `toDateInputValue()` / `toTimeInputValue()` to extract ET values
- **"Today" filter** computes ET midnight→midnight boundaries in UTC for DB queries

### Design System (Style Colors)
- **Single source of truth**: `src/lib/styleColors.ts`
- **Colors by dance style** (NOT event type) — 12 styles (11 + "Other")
- **Multi-style events**: primary style (first in array) determines color
- **Applied consistently** across Calendar tiles (15% tint + 4px left border), List cards (4px left border + colored dots), Map markers (fill color + legend), homepage styles grid

### Map System
- **Leaflet.js** with OpenStreetMap tiles, dynamically imported (`ssr: false`)
- **Marker shapes by event type**: Social=circle, Tango Milonga=ring, Group Class=square, Workshop=diamond, Festival=triangle
- **Marker colors by dance style** from shared palette
- **Legend** shows both shape (event type) and color (dance style)
- **Icon caching** by `color-shape` key to avoid recreating Leaflet icons
- **Jitter** prevents exact-overlap markers at same address
- **Debug logging** (dev only): `[Map Debug]` counts by eventType + missing coords; client-side `console.warn` for dropped events

---

## 3. Architecture Decisions

### Next.js App Router
All pages use the App Router pattern. Server components fetch data via Prisma directly (no API call needed for server-rendered pages). Client components use `fetch()` to API routes. Dynamic params use `Promise<{ id: string }>` signature (Next 15+).

### Prisma + Neon
- Schema uses `String` for flexible fields (`eventType`, `status`, `role`, JSON array `styles`) rather than database enums — allows easier iteration without migrations
- JSON arrays (`styles`, `skillLevels`, `offerings`, `languages`, `djStyles`) stored as `String` and parsed with `parseJsonArray()`
- Migrations: `npx prisma db push` (NOT `prisma migrate dev` — Neon branch-based workflow + legacy SQLite migration lock)

### Auth Flow
```
Google/Email → NextAuth → /onboarding (role pick) → /dashboard or /instructor/dashboard
```
- Session strategy: database (not JWT); 30-day sessions
- Admin check: email in `ADMIN_EMAILS` env var
- Soft gating: instructor `contactEmail`/`contactNotes` redacted server-side for unauthenticated users

### Build System
The `--webpack` flag is **REQUIRED** for `next build` and `next dev`. Turbopack has incompatibilities with `next-pwa` v5 (webpack-based config). Configured in `package.json` scripts.

### Environment Variables
See `docs/SYSTEM_OVERVIEW.md` for the full required list. Key production requirements:
- `NEXTAUTH_URL=https://nododance.com` (must be set explicitly on Vercel)
- `DATABASE_URL` / `DIRECT_URL` (Neon connection strings)
- `ADMIN_EMAILS` (comma-separated admin email addresses)
- `CLOUDINARY_*` (3 vars) — validated at cold start; missing vars block uploads
- `EMAIL_SERVER_*` + `EMAIL_FROM` — validated at cold start; missing vars block magic link
- `NEXT_PUBLIC_CITY` (default `Charlotte`)

---

## 4. Dance Styles & Colors (Current)

12 styles defined in `src/lib/constants.ts` and `src/lib/styleColors.ts`:

| Style | Hex | Note |
|-------|-----|------|
| Salsa | `#E85D5D` | Warm Red |
| Bachata | `#F4A261` | Soft Amber |
| Cumbia | `#F472B6` | Pink |
| Kizomba | `#6C63FF` | Deep Indigo |
| Zouk | `#00B4D8` | Electric Teal |
| Tango | `#2F3E46` | Charcoal Blue |
| West Coast Swing | `#8B5CF6` | Violet |
| Carolina Shag | `#10B981` | Emerald |
| Balboa | `#D97706` | Burnt Orange |
| Ballroom | `#0EA5E9` | Sky Blue |
| Country Line Dancing | `#A3722B` | Saddle Brown |
| Other | `#9CA3AF` | Neutral Gray |

**Homepage display**: all 11 named styles shown as colored cards with Heart icons; "Other" is filtered out of the homepage grid but remains valid in forms.

### Event Type → Shape (Map only)

| Event Type | Shape | SVG |
|------------|-------|-----|
| `SOCIAL` | Circle | Filled circle |
| `TANGO_MILONGA` | Ring | Circle with white center hole |
| `GROUP_CLASS` | Square | Filled rounded square |
| `WORKSHOP` | Diamond | Rotated square |
| `FESTIVAL` | Triangle | Upward triangle |

Back-compat shim in `getEventTypeValue()` (`src/lib/utils.ts`) maps legacy `SOCIAL_MILONGA` → `TANGO_MILONGA` (if styles include `Tango`) or `SOCIAL`.

---

## 5. Where to Make Design / Behavior Changes

| Change | File |
|--------|------|
| Dance styles list | `src/lib/constants.ts` (`DANCE_STYLES`) |
| Dance style colors | `src/lib/styleColors.ts` (`DANCE_STYLE_COLORS`) |
| Event types | `src/lib/constants.ts` (`EVENT_TYPES`) |
| Map marker shapes | `src/components/events/events-map-view.tsx` (`EVENT_TYPE_SHAPES`) |
| Calendar tile style | `src/components/events/events-month-calendar.tsx` |
| List card style | `src/components/events/event-card.tsx` + compact/tile variants |
| Instructor card style | `src/components/instructors/instructor-card.tsx` + compact/tile variants |
| Event detail page | `src/components/events/event-details-view.tsx` |
| Instructor profile UI | `src/components/instructors/instructor-profile-view.tsx` |
| Instructor edit form | `src/components/instructors/instructor-profile-editor.tsx` |
| Email templates | `src/lib/email.ts` |
| Geocoding logic | `src/lib/geocode.ts` |
| Timezone display | `src/lib/utils.ts` |
| Timezone storage | `parseAsET()` in `src/app/api/events/submit/route.ts` |
| Global theme | `tailwind.config.ts` |
| PWA config | `next.config.js` + `public/manifest.json` |

---

## 6. File Structure (Current)

```
src/
  app/
    api/
      account/route.ts                     # DELETE account + cascade all user data
      admin/events/route.ts                # Admin event CRUD, approve, geocode, bulk re-geocode
      admin/profiles/route.ts              # Admin list/delete instructor profiles
      auth/[...nextauth]/route.ts          # NextAuth handler
      events/route.ts                      # GET approved events (filters, mapMode, monthRange)
      events/my/route.ts                   # GET current user's submitted events / single by id
      events/submit/route.ts               # POST/PUT/DELETE events (supports series)
      instructor-profile/route.ts          # Create/upsert instructor profile
      instructors/route.ts                 # GET instructor directory (soft-gated email)
      lesson-requests/route.ts             # POST lesson request (honeypot + rate limit)
      saved/event/route.ts                 # GET + POST toggle saved events
      saved/instructor/route.ts            # GET + POST toggle saved instructors
      upload/event-image/route.ts          # POST Cloudinary upload (event)
      upload/profile-photo/route.ts        # POST Cloudinary upload (profile)
      user/role/route.ts                   # PUT update user role
    account/page.tsx                       # Dancer dashboard (saved, settings)
    admin/page.tsx                         # Admin gate
    admin/admin-panel.tsx                  # Admin moderation UI
    auth/signin/page.tsx                   # Magic-link + Google sign-in
    auth/verify/page.tsx                   # "Check your email" page
    auth/error/page.tsx                    # Auth error page
    become-an-instructor/page.tsx          # Upgrade CTA + flow
    dashboard/page.tsx                     # Pure redirect to role-specific dashboard
    events/page.tsx                        # Calendar | List | Map views
    events/[id]/page.tsx                   # Event detail
    instructor/dashboard/page.tsx          # Instructor's events + profile summary
    instructor/profile/edit/page.tsx       # Instructor profile editor
    instructors/page.tsx                   # Instructor directory
    instructors/[slug]/page.tsx            # Public instructor profile
    onboarding/page.tsx                    # Role picker
    submit-event/page.tsx                  # Event submission form (soft-gated)
    layout.tsx                             # Root layout (Leaflet CSS via CDN)
    page.tsx                               # Homepage (hero, styles, CTAs)
    globals.css                            # Tailwind base
  components/
    account/
      account-dashboard.tsx                # Dancer dashboard UI (saved, settings)
    auth/
      danger-zone.tsx                      # Account deletion section
      delete-account-modal.tsx             # Deletion confirmation modal
      event-gate-modal.tsx                 # Soft gate for event submit (benefits list)
      login-prompt-card.tsx                # Generic login CTA
      onboarding-picker.tsx                # Two-card DANCER/INSTRUCTOR picker
      save-button.tsx                      # Toggle save/unsave heart
      sign-out-button.tsx                  # NextAuth signOut
      upgrade-button.tsx                   # DANCER → INSTRUCTOR upgrade
    dashboard/
      dashboard-view.tsx                   # Instructor dashboard
      profile-editor.tsx                   # (legacy alias — see instructors/)
    events/
      event-card.tsx                       # Full card (comfortable)
      event-card-compact.tsx               # 2-col grid card
      event-card-tile.tsx                  # Single-row list tile
      event-details-view.tsx               # Event detail page body
      events-map-view.tsx                  # Leaflet map + legend
      events-month-calendar.tsx            # Month grid with EventChip badges
    instructors/
      instructor-card.tsx                  # Full card
      instructor-card-compact.tsx          # 2-col grid card
      instructor-card-tile.tsx             # Single-row list tile
      instructor-profile-view.tsx          # Public profile body (soft-gated contact)
      instructor-profile-editor.tsx        # Edit form
      lesson-request-modal.tsx             # Contact modal (honeypot + rate limit)
    layout/
      header.tsx                           # Top nav (role-aware)
      footer.tsx                           # Footer (@nododance IG, nododance@gmail.com)
      mobile-nav.tsx                       # Mobile bottom nav
    providers/
      session-provider.tsx                 # NextAuth SessionProvider wrapper
    ui/
      animated-nodes.tsx                   # Hero background animation
      badge.tsx                            # Label badge
      button.tsx                           # Variants: default / gradient / outline
      card.tsx                             # Card wrapper
      input.tsx                            # Text input
      select.tsx                           # Select dropdown
      textarea.tsx                         # Text area
    view-mode-toggle.tsx                   # 3-mode density switcher (Comfortable/Compact/Tile)
  lib/
    auth.ts                                # NextAuth config, isAdmin(), getDashboardUrl()
    calendar-utils.ts                      # Month grid + event grouping helpers
    cloudinary.ts                          # Upload presets + validation
    constants.ts                           # DANCE_STYLES, EVENT_TYPES, SKILL_LEVELS, LOCATION_TYPES, LESSON_TYPES, INSTRUCTOR_OFFERINGS, LANGUAGES
    email.ts                               # sendLessonRequestEmail, sendEventSubmissionEmail
    geocode.ts                             # geocodeAddress + sanitizeAddress + buildGeoQuery
    prisma.ts                              # Prisma client singleton
    rate-limit.ts                          # LRU + DB-backed rate limiting
    styleColors.ts                         # DANCE_STYLE_COLORS + helpers (getStyleColor, hexToRgba)
    useViewMode.ts                         # React hook for view density preference
    utils.ts                               # cn, parseJsonArray, formatDate/Time, toDateInputValue, extractInstagramHandle, getYouTubeEmbedUrl, getEventTypeValue
  types/
    next-auth.d.ts                         # Extended Session/User types (role, isAdmin)
prisma/
  schema.prisma                            # Full schema (see docs/DATABASE_SCHEMA.md)
  seed.ts                                  # Sample instructors + events
scripts/
  extend-recurring-events.ts               # One-off: extend series by N weeks (dry-run by default)
  generate-favicons.mjs                    # Favicon generator
  migrate-timezone.ts                      # One-off: migrate pre-parseAsET events
public/
  manifest.json / sw.js                    # PWA assets (generated by next-pwa)
```

---

## 7. Database Models (Summary)

See `docs/DATABASE_SCHEMA.md` for full field lists. Models:

| Model | Purpose | Notes |
|-------|---------|------|
| `User` | Accounts | `role: String default DANCER` |
| `Account` | OAuth tokens | Standard NextAuth shape |
| `Session` | Auth sessions | Database strategy, 30-day TTL |
| `VerificationToken` | Magic link tokens | Standard NextAuth shape |
| `InstructorProfile` | Instructor data | Includes DJ flag, `otherStyle`, contact fields |
| `Event` | Dance events | Recurrence fields + JSON styles + `otherStyle` |
| `LessonRequest` | Student inquiries | Ties to `InstructorProfile` |
| `SavedInstructor` | Bookmark join | Unique `(userId, instructorId)` |
| `SavedEvent` | Bookmark join | Unique `(userId, eventId)` |
| `RateLimitEntry` | Throttling | Unique `(identifier, action)` |

---

## 8. Major Fixes on Record

See `docs/build-fixes.md` for the full running list. Notable items:

- **Turbopack vs Webpack** — `--webpack` flag required by `next-pwa` v5
- **Next 16 Promise params** — dynamic route `params` must be `Promise<{...}>`
- **useSearchParams Suspense** — client pages using `useSearchParams()` wrapped in `<Suspense>`
- **react-leaflet v5 ERESOLVE** — pinned to v4 (React 18 compat)
- **Events/Instructors crash** — APIs return `[]` on error; clients normalize to array
- **Timezone bug (7 PM → 2 PM)** — `parseAsET()` in submit route + ET-aware display
- **Google OAuth redirect mismatch** — `NEXTAUTH_URL=https://nododance.com` + `vercel.json` redirect from `nodo-dance.vercel.app`
- **One-off event submission** — frontend strips recurrence fields when `isRecurring=false`; backend uses `z.preprocess` to coerce `""` → `undefined`
- **Geocoding suite/unit failures** — `sanitizeAddress()` + retry
- **Map missing events** — dev-only `console.warn` for dropped events; admin bulk re-geocode tool

---

## 9. Scripts (One-offs)

| Script | Purpose |
|--------|---------|
| `scripts/extend-recurring-events.ts` | Extend an existing recurring series by N additional weeks. Dry-run by default; pass `--execute` to write. Handles anchor-shift if series has fully expired. |
| `scripts/migrate-timezone.ts` | One-off migration for events stored before `parseAsET` was added. |
| `scripts/generate-favicons.mjs` | Regenerate favicon set from source logo. |
| `prisma/seed.ts` | `npm run db:seed` — 8 sample instructors + 10 sample approved events in Charlotte. |

Run scripts with `tsx scripts/<name>.ts`.
