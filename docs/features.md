# Nodo Dance — Feature Inventory

> Authoritative feature list derived from the live codebase. Last updated: 2026-04-24.

## Feature 1: Instructor Profiles
- Instructors create profiles with: display name, headline, bio, photo, dance styles (JSON array), `otherStyle` (free text for "Other"), skill levels, pricing (`offersPrivate` + `privateRateHourly`, `offersGroup` + `groupRatePerClass` + `groupClassNotes`), location (`locationType`, `neighborhood`, `address`, `travelRadiusMiles`), social links (Instagram, website, booking URL, YouTube, TikTok), offerings, languages, certifications, years teaching, students taught
- **Placeholder rating**: `rating Float @default(4.9)` until a real review system is added
- Public slug URL: `/instructors/[slug]`
- Editor at `/instructor/profile/edit` using `InstructorProfileEditor`
- Photo upload via `/api/upload/profile-photo` → Cloudinary (512×512 face-cropped, folder `nodo-dance/instructors`)
- Admin moderation via `/admin`
- Public directory at `/instructors` with search, filters, sort (recommended / price-low / price-high / most-styles), and view-density toggle (Comfortable / Compact / Tile)
- **DJ feature**: `isDJ` boolean + `djStyles` JSON array; filter via `?djOnly=1`

## Feature 2: Event System
- Submitted via `/submit-event` form (soft-gated; form persists draft to `localStorage` key `eventDraft`)
- Fields: title, `eventType` (SOCIAL|TANGO_MILONGA|GROUP_CLASS|WORKSHOP|FESTIVAL), styles (multi-select), `otherStyle` free text, startDate + startTime, optional endTime, venueName, address, price (null=free), organizerName, organizerEmail, instagramUrl?, websiteUrl?, description, imageUrl?, recurrence fields, honeypot
- Event image via `/api/upload/event-image` → Cloudinary (limit 1600w, folder `nodo-dance/events`)
- Events start as `PENDING` and require admin approval (`APPROVED` | `REJECTED`)
- Admin panel at `/admin` shows pending events; supports approve, reject, delete, re-geocode, bulk re-geocode
- Approved events surface on `/events` in three views (Calendar, List, Map)
- Zod server validation with `preprocess` to coerce empty strings → undefined for recurrence numbers
- Rate-limited to 10 submissions / IP / hour (admins bypass; toggle via `EVENT_RATE_LIMIT_ENABLED`)

## Feature 3: Recurring Events
Schema fields on `Event`: `isRecurring`, `recurrenceGroupId` (UUID), `recurrenceDay` (0–6 Sun..Sat), `recurrenceInterval` (1 weekly, 2 biweekly), `recurrenceCount`, `recurrenceIndex` (1-based position).

- **On submit**: if `isRecurring && recurrenceWeeks >= 2`, API calls `prisma.event.createMany` to create N rows (min 2, max 52) sharing `recurrenceGroupId`; sends ONE admin notification for the whole series.
- **Series edit**: `PUT /api/events/submit` with `editSeries: true` updates shared fields via `updateMany` while preserving per-occurrence dates.
- **Series approval**: `PUT /api/admin/events` with `seriesAction: "approve-series"` or `"reject-series"`; if approved and coords missing, geocoding runs once and updates all occurrences.
- **Series delete**: owner via `DELETE /api/events/submit` with `deleteSeries: true`; admin via `DELETE /api/admin/events` with `deleteSeries: true`.
- **Frontend**: `/submit-event` strips recurrence fields from payload when `isRecurring=false` to avoid "expected number, received string" validation errors.
- **Extend a series**: `scripts/extend-recurring-events.ts` (dry-run by default; `--execute` to write).

## Feature 4: Events Map View (Leaflet + OSM)

- Third view toggle on `/events`: Calendar | List | **Map**
- Uses Leaflet + react-leaflet v4 + OpenStreetMap tiles (FREE, no API key)
- Leaflet CSS loaded from CDN in `src/app/layout.tsx`
- Map component: `src/components/events/events-map-view.tsx`
  - Dynamic import with `ssr: false` (Leaflet needs browser APIs)
  - Loading fallback: animated pulse skeleton
- **Marker color**: primary dance style (`getStyleColor(event.styles)` → `DANCE_STYLE_COLORS`)
- **Marker shape by event type**:
  - `SOCIAL` → circle
  - `TANGO_MILONGA` → ring (circle with white center hole)
  - `GROUP_CLASS` → square
  - `WORKSHOP` → diamond
  - `FESTIVAL` → triangle
- SVG icons built in code, cached by `${color}-${shape}` key
- Jitter algorithm for overlapping pins

### Geocoding
- Server-side geocoding via OpenStreetMap Nominatim API
- `src/lib/geocode.ts`: `geocodeAddress(query)`, `sanitizeAddress()`, `buildGeoQuery(venueName, address)`
- Automatic fallback: strips Suite/Ste/Apt/Unit/#/Bldg/Building/Floor/Fl/Room/Rm tokens and retries if the first lookup returns zero results
- Geocoding runs at: event submit, admin approval (if lat/lng null), admin re-geocode action, admin bulk re-geocode (1.1s delay per request for Nominatim's 1 req/sec policy)
- Results saved as `lat Float?` and `lng Float?` on Event
- Nominatim User-Agent: `NodoDance/1.0 (nodo-dance-app)`

### Map API
- `GET /api/events?mapMode=1` filters for events where `lat IS NOT NULL AND lng IS NOT NULL`
- Date range toggle: Day (`today`) | Week (`this-week`) | Month (`this-month`)
- URL params: `?view=map&range=this-week&styles=Salsa,Bachata`
- Debug logging (`[Map Debug]`) prints counts by event type and number of events with missing coords

### Map Popups
- Title, colored style dot, event type label, venue, date/time, price
- "Details" link → `/events/[id]`
- "Open in Google Maps" link → `https://www.google.com/maps/search/?api=1&query=lat,lng`

### Legend
- Shape legend (Social/Milonga/Class/Workshop/Festival) + color legend per dance style

## Feature 5: Soft Gate Conversion (Event Submission)
- Anyone can browse and fill the event submission form without an account
- Submitting or uploading images requires authentication
- Gate modal (`EventGateModal`) shows value props and CTAs to sign in / register
- Form data persisted to `localStorage` key `eventDraft` — survives sign-in redirect
- Auto-saves draft on every field change, loads on mount, clears on successful submit
- Server-side enforcement: `/api/events/submit` and `/api/upload/event-image` return `{ error: 'AUTH_REQUIRED' }` with 401 when unauthenticated

## Feature 6: DANCER / INSTRUCTOR Role System
- Default role: `DANCER` (Prisma schema)
- Onboarding flow at `/onboarding` — two-card picker
- Role-based dashboard routing via `getDashboardUrl(role)` in `src/lib/auth.ts`
- `/dashboard` is a pure redirect based on role
- Dancer dashboard at `/account` with tabs: Saved Instructors, Saved Events, Settings
- Instructor dashboard at `/instructor/dashboard`
- Upgrade path: DANCER → INSTRUCTOR via `PUT /api/user/role`
- Header nav adjusts based on role (shows "Become an Instructor" for non-instructors)

## Feature 7: Bookmarks (Save System)
- Users can save/bookmark instructors and events
- `SaveButton` component with toggle behavior
- API routes: `/api/saved/instructor` and `/api/saved/event`
  - `GET` returns arrays of saved IDs
  - `POST` toggles save state
- Saved items shown in dancer dashboard tabs

## Feature 8: Lesson Requests
- Dancers can contact instructors via `LessonRequestModal`
- Form: name, email, phone (optional), style, lesson type (`PRIVATE`|`GROUP`|`EITHER`), preferred times, message (min 10 chars), honeypot
- Rate-limited 5/IP/hour
- On success: creates `LessonRequest` row, sends two emails (instructor + student confirmation)
- Fallback for instructors without `contactEmail` set; otherwise direct "Email Instructor" mailto + "Copy Email" button

## Feature 9: Soft-Gated Instructor Contact Flow
- `contactEmail` is stored on `InstructorProfile`
- Visible in public directory and profile view ONLY when user is logged in
- Server-side redaction: `/api/instructors` uses `select: { contactEmail: isLoggedIn, contactNotes: isLoggedIn, ... }`
- Instructor profile server component strips fields before passing to client
- Locked card UI ("Create Free Account to Unlock Contact") shown to visitors

## Feature 10: View Density Toggle
- Three modes: Comfortable (full cards), Compact (2-col grid), Tile (single-row list)
- Hook: `useViewMode(storageKey, defaultMode)` in `src/lib/useViewMode.ts`
- Persisted via `localStorage` (SSR-safe)
- Used on `/events` (list view, key `nodo-events-density`) and `/instructors`
- UI: `<ViewModeToggle mode={mode} onChange={setMode} />`

## Feature 11: Homepage Dance Styles Display
- Renders all `DANCE_STYLES` except "Other" (11 cards) in the homepage "Dance Styles We Love" section
- Each card uses `DANCE_STYLE_COLORS[style]` for the Heart icon color
- Mobile: 2 cols, tablet: 3 cols, desktop: 4 cols

## Feature 12: PWA Support
- `next-pwa` generates service worker at `/public/sw.js`
- Manifest at `/public/manifest.json`
- Disabled in development mode
- Requires `--webpack` build flag (see `build-fixes.md`)

## Feature 13: Admin Panel
- Protected at `/admin` — checks `isAdmin(email)` against `ADMIN_EMAILS`
- Event moderation:
  - Approve / reject individual events
  - Approve / reject entire series (`seriesAction`)
  - Delete single or entire series
  - Re-geocode single event (`action: "geocode"`)
  - Bulk re-geocode all events missing coords (`action: "geocode-all"`; 1.1s delay per request)
- Profile moderation:
  - List all instructor profiles
  - Delete profile (cascade via Prisma)
- Revalidates `/events` and `/events/[id]` paths on status changes

## Feature 14: Timezone Handling (America/New_York)
- `APP_TIMEZONE = 'America/New_York'` in `src/lib/utils.ts`
- User input parsed with `parseAsET(dateStr, timeStr)` to produce correct UTC Date
- All display functions pass `timeZone: 'America/New_York'`
- Edit mode uses `toDateInputValue()` / `toTimeInputValue()` for `<input type="date">` / `<input type="time">`
- "Today" filter on `/api/events` computes ET midnight→midnight boundary in UTC

## Feature 15: Image Uploads (Cloudinary)
- `src/lib/cloudinary.ts` validates env vars at cold start
- Accepts JPEG / PNG / WebP only, max 5MB
- Two presets:
  - `profile-photo`: 512×512 face-cropped, folder `nodo-dance/instructors`
  - `event-image`: limit 1600w preserving aspect, folder `nodo-dance/events`
- API routes: `/api/upload/profile-photo`, `/api/upload/event-image` (auth-required)

## Constants (Current)

```
DANCE_STYLES: [
  'Salsa', 'Bachata', 'Cumbia', 'Kizomba', 'Zouk', 'Tango',
  'West Coast Swing', 'Carolina Shag', 'Balboa', 'Ballroom',
  'Country Line Dancing', 'Other'
]  # 12 total

EVENT_TYPES: SOCIAL, TANGO_MILONGA, GROUP_CLASS, WORKSHOP, FESTIVAL

LESSON_TYPES: PRIVATE, GROUP, EITHER

LOCATION_TYPES: STUDIO, DANCE_SCHOOL, TRAVEL_TO_STUDENT, FLEXIBLE

SKILL_LEVELS: Beginner, Intermediate, Advanced

LANGUAGES: English, Spanish, Portuguese, French, Italian, Other

INSTRUCTOR_OFFERINGS: Private lessons, Group class, Workshops,
                     Choreography, Wedding dance, DJ services, Event hosting

DANCE_STYLE_COLORS: {
  Salsa:              '#E85D5D'
  Bachata:            '#F4A261'
  Cumbia:             '#F472B6'
  Kizomba:            '#6C63FF'
  Zouk:               '#00B4D8'
  Tango:              '#2F3E46'
  'West Coast Swing': '#8B5CF6'
  'Carolina Shag':    '#10B981'
  Balboa:             '#D97706'
  Ballroom:           '#0EA5E9'
  'Country Line Dancing': '#A3722B'
  Other:              '#9CA3AF'
}
```

## Remaining Risks / Things to Watch
1. **next-pwa is abandoned** — v5.6.0 last released 2022. If Next.js drops webpack support, PWA breaks. Consider `@ducanh2912/next-pwa` or `serwist`.
2. **Nominatim rate limits** — free tier is 1 req/sec. Fine for individual submits; bulk geocode loop respects this (1.1s delay), but under load a more robust provider (or a paid tier) may be needed.
3. **react-leaflet v4 ceiling** — pinned to v4 for React 18 compat. If the project upgrades to React 19, can upgrade to react-leaflet v5.
4. **Stale Prisma migrations** — `prisma/migrations/` contains SQLite-era files. Use `db push`, not `migrate dev`.
5. **themeColor warnings** — non-blocking; Next wants it in `viewport` export, not `metadata`.
6. **`rating` placeholder** — all instructors default to 4.9 until review system lands.
7. **Case-sensitive search** — `contains` filter is case-sensitive; consider `mode: 'insensitive'` when fully on Postgres.
