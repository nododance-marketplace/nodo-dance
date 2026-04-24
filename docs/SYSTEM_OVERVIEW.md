# Nodo Dance — System Overview

> For new developers: this document explains how data flows through the system, how auth works, and how to set up the project. Target onboarding time: under 30 minutes.

---

## Data Flow: Event Creation → DB → Rendering

```
1. User fills form at /submit-event (draft auto-saved to localStorage as "eventDraft")
   ↓
2. Client validates with Zod (react-hook-form + zodResolver)
   ↓
3. POST /api/events/submit
   - Auth check (session required; 401 AUTH_REQUIRED if missing)
   - Server Zod validation (preprocess coerces "" → undefined for recurrence numbers)
   - Honeypot check (rejects bots)
   - Rate limit check (10/IP/hour; admins bypass; disabled via EVENT_RATE_LIMIT_ENABLED=false)
   - parseAsET() converts date+time → proper UTC
   - buildGeoQuery() + geocodeAddress() → lat/lng (with sanitize fallback)
   - Prisma creates Event(s) with status: "PENDING"
       • Single event: prisma.event.create
       • Recurring series: prisma.event.createMany with shared recurrenceGroupId
   - sendEventSubmissionEmail() → admin notification (ADMIN_EMAILS)
   ↓
4. Admin approves at /admin
   - PUT /api/admin/events { eventId, status: "APPROVED" }
   - On approval, auto-geocodes if lat/lng missing
   - Series approval: { eventId, seriesAction: "approve-series" } → updateMany by recurrenceGroupId
   - revalidatePath('/events') and `/events/${id}`
   ↓
5. Event appears in public views:
   - Calendar: GET /api/events?monthStart=...&monthEnd=...
   - List: GET /api/events?dateFilter=this-week
   - Map: GET /api/events?mapMode=1&dateFilter=this-week
   ↓
6. Client renders based on view:
   - Calendar → EventsMonthCalendar (EventChip per event)
   - List (3 densities) → EventCard | EventCardCompact | EventCardTile
   - Map → Leaflet Marker per event (lat/lng required)
```

### Recurring Events
When `isRecurring: true`, the API creates N individual Event rows linked by `recurrenceGroupId` (UUID). Each has `recurrenceIndex` (1-based position), `recurrenceCount` (total), `recurrenceDay` (0–6, Sun–Sat), and `recurrenceInterval` (1 = weekly, 2 = biweekly).

- **Series edit** (`PUT /api/events/submit` with `editSeries: true`) updates shared fields on all rows via `updateMany`; dates are preserved per-occurrence.
- **Series approval** (`PUT /api/admin/events` with `seriesAction: "approve-series"` or `"reject-series"`) bulk-updates status; geocoding happens once and applies to all.
- **Series delete** (`DELETE /api/events/submit` with `deleteSeries: true`) is owner-only. Admin has its own series delete path under `/api/admin/events`.

---

## Auth Flow

```
Visitor → /auth/signin
  ├─ Google OAuth → callback → /onboarding (role pick)
  └─ Magic Link → email → /auth/verify → link click → callback → /onboarding

/onboarding
  ├─ If role already chosen: redirect to role-specific dashboard
  ├─ User picks DANCER → stays (or → /account)
  └─ User picks INSTRUCTOR → /instructor/dashboard (prompt to create profile)
```

### Session Structure
```typescript
session.user = {
  id: string       // Prisma User.id
  email: string
  name: string
  role: string     // "DANCER" | "INSTRUCTOR"
  isAdmin: boolean // derived from ADMIN_EMAILS env var
}
```

### Admin Access
No admin role in DB. Admin is determined at runtime by `isAdmin()` in `src/lib/auth.ts` — splits `ADMIN_EMAILS` by comma, trims, and checks membership.

### Cookie Naming
- Dev: `next-auth.session-token`
- Prod: `__Secure-next-auth.session-token` (secure, httpOnly, SameSite=Lax)

---

## Soft Gating Flow

Nodo uses "soft gates" — content is visible but specific actions require auth:

| Feature | Visitor (no auth) | Logged In |
|---------|-------------------|-----------|
| Browse events | Yes | Yes |
| View event details | Yes | Yes |
| Submit event | Fill form OK; POST returns `AUTH_REQUIRED` (401); gate modal shown | Yes (pending approval) |
| Save event/instructor | Redirect to sign in | Yes |
| View instructor profiles | Yes (contact gated) | Yes |
| See instructor email | No (locked card shown) | Yes (with Copy Email button) |
| Request lesson | Redirect to sign in | Yes |
| See payment methods | No (locked message) | Yes |

### How `contactEmail` is secured:
1. **Server component** (`/instructors/[slug]/page.tsx`): strips `contactEmail`/`contactNotes` before passing to client when `!isLoggedIn`
2. **Public API** (`/api/instructors`): Prisma `select` uses `contactEmail: isLoggedIn` and `contactNotes: isLoggedIn` — fields are not included in response when unauthenticated
3. **No `user.email` leakage**: public API does not include the `user` relation

### Draft persistence for event submission
- `localStorage` key: `eventDraft` — saved on every field change
- Loaded on mount, cleared on successful submit
- Survives the sign-in redirect

---

## Map Filtering Flow

```
Client sets view to "map"
  ↓
fetchEvents() builds params:
  - mapMode=1
  - dateFilter = today | this-week | this-month (from mapRange state)
  - styles, eventTypes, search (if set)
  ↓
GET /api/events?mapMode=1&dateFilter=this-week
  - Server: status=APPROVED, startDateTime in range
  - Server: when mapMode=1, AND [{ lat: { not: null } }, { lng: { not: null } }]
  - Server: [Map Debug] log counts by type + missing coords
  ↓
Client receives events
  - Client filters again: events.filter(e => e.lat != null && e.lng != null)
  - Dev warning: console.warn for events dropped due to missing coords
  ↓
EventsMapView renders:
  - Each event → Leaflet Marker
  - Color from getStyleColor(event.styles) → DANCE_STYLE_COLORS
  - Shape from getEventTypeShape(event.eventType) → EVENT_TYPE_SHAPES
  - Icon cached by `${color}-${shape}` key
  - Popup: title, style dot, event type label, venue, date/time, price, links
  - Legend: event type shapes + dance style color dots
```

---

## Timezone Storage & Display

### Principle
> "Store UTC, display ET, interpret form input as ET."

### `APP_TIMEZONE = 'America/New_York'` (`src/lib/utils.ts`)

### Storage
All `DateTime` fields in PostgreSQL are stored as UTC. When a user enters "7:00 PM" on February 27, `parseAsET()` in the submit route converts this to the correct UTC equivalent.

```typescript
function parseAsET(dateStr: string, timeStr: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00.000Z`)
  const etStr = naive.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const etDate = new Date(etStr)
  const offsetMs = naive.getTime() - etDate.getTime()
  return new Date(naive.getTime() + offsetMs)
}
```

### Display
All formatting functions in `src/lib/utils.ts` pass `timeZone: 'America/New_York'`:
- `formatDate()` — "Thu, Feb 27, 2026"
- `formatTime()` — "7:00 PM"
- `formatDateTime()` — combined
- `toDateInputValue()` — "2026-02-27" (for `<input type="date">`)
- `toTimeInputValue()` — "19:00" (for `<input type="time">`)

### "Today" Filter
The API's "today" filter computes ET day boundaries:
```
ET date string → naive midnight UTC → compute ET offset → actual midnight ET in UTC
endDate = startDate + 24h
```
Ensures "today" means "today in Eastern Time" on Vercel's UTC servers.

---

## Rate Limiting

`src/lib/rate-limit.ts` uses a two-tier strategy:

1. **LRU cache** (in-memory, 500 entries, 1-hour TTL) — fast path for dev and warm containers
2. **Prisma `RateLimitEntry` upsert** — persists across cold starts; window resets when `windowStart` is older than the limit window

**Actions tracked**:
- `submit-event` — 10/hr per IP
- `lesson-request` — 5/hr per IP

`getClientIp(req)` reads `x-forwarded-for` first entry (Vercel/Cloudflare-compatible). Failures are fail-open (never block legitimate users).

---

## Image Uploads (Cloudinary)

`src/lib/cloudinary.ts`:
- Validates env vars at cold start; logs fatal error if missing
- Accepts JPEG / PNG / WebP only, max 5MB
- Two presets:
  - `profile-photo` → folder `nodo-dance/instructors`, 512×512 fill crop with `gravity: face`
  - `event-image` → folder `nodo-dance/events`, limit 1600 wide, preserves aspect
- Converts `File` → base64 data URI → `cloudinary.uploader.upload()`
- Returns `secure_url` for storage on the model

Upload API routes: `/api/upload/profile-photo` and `/api/upload/event-image` (both auth-required, multipart/form-data).

---

## Email (Nodemailer + SMTP)

`src/lib/email.ts` and `src/lib/auth.ts`:
- Transport: `createTransport({ host, port, auth: { user, pass } })`
- `FROM_EMAIL` env: `EMAIL_FROM` (defaults to `Nodo Dance <noreply@nododance.com>`)
- **Magic link**: sent directly by NextAuth `EmailProvider.sendVerificationRequest` — custom HTML template with gradient button
- **Lesson request**: two-email send (instructor + student confirmation) via `Promise.all`
- **Event submission**: single email to comma-joined `ADMIN_EMAILS`
- `getAppUrl()` auto-detects Vercel env (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`) before falling back to `NEXT_PUBLIC_APP_URL`

---

## Environment Variables

### Required for Production

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require&pgbouncer=true` | Prisma connection (pooled) |
| `DIRECT_URL` | `postgresql://user:pass@host/db?sslmode=require` | Prisma direct connection (Neon, for migrations) |
| `NEXTAUTH_URL` | `https://nododance.com` | Canonical auth URL (MUST be set) |
| `NEXTAUTH_SECRET` | (random 32+ chars) | Session encryption key |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google OAuth (optional — omit to hide Google button) |
| `GOOGLE_CLIENT_SECRET` | (from Google Cloud Console) | Google OAuth |
| `ADMIN_EMAILS` | `admin@example.com,admin2@example.com` | Comma-separated admin emails |
| `EMAIL_SERVER_HOST` | `smtp.gmail.com` | SMTP host |
| `EMAIL_SERVER_PORT` | `587` | SMTP port |
| `EMAIL_SERVER_USER` | `nododance@gmail.com` | SMTP username |
| `EMAIL_SERVER_PASSWORD` | (app password) | SMTP password |
| `EMAIL_FROM` | `Nodo Dance <noreply@nododance.com>` | From address |
| `CLOUDINARY_CLOUD_NAME` | `your-cloud` | Cloudinary account |
| `CLOUDINARY_API_KEY` | (from Cloudinary dashboard) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | (from Cloudinary dashboard) | Cloudinary API secret |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_CITY` | `Charlotte` | City name for UI |
| `NEXT_PUBLIC_APP_URL` | (derived from Vercel env) | App URL for emails |
| `EVENT_RATE_LIMIT_ENABLED` | `true` | Set to `false` to disable event submission rate limiting |

### Auto-set by Vercel
`VERCEL`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_ENV` — used by `getAppUrl()` in `email.ts`.

---

## Production Setup Checklist

1. **Database**: Create Neon project, get connection strings for `DATABASE_URL` and `DIRECT_URL`
2. **Push schema**: `npx prisma db push` (use from local machine with direct URL set)
3. **Vercel**: Connect repo, add all environment variables above
4. **`NEXTAUTH_URL`**: Set to `https://nododance.com` (NOT the Vercel URL) — prevents Google OAuth redirect mismatch
5. **Google OAuth**: Add `https://nododance.com/api/auth/callback/google` as authorized redirect URI in Google Cloud Console
6. **Domain**: Connect custom domain in Vercel, verify SSL propagation
7. **`vercel.json`**: Already configured with 301 redirect from `nodo-dance.vercel.app` → `nododance.com`
8. **Admin**: Add your email to `ADMIN_EMAILS` to access `/admin`
9. **Cloudinary**: Create account, copy cloud name + API key/secret
10. **SMTP**: Gmail with app password works fine — `EMAIL_SERVER_PASSWORD` is the app password, not the account password
11. **Test**: Submit an event, approve it from admin, verify it appears in Calendar/List/Map

---

## Key File Reference

| Need to change... | Edit this file |
|-------------------|---------------|
| Dance style list | `src/lib/constants.ts` |
| Dance style colors | `src/lib/styleColors.ts` |
| Event types | `src/lib/constants.ts` |
| Timezone display | `src/lib/utils.ts` |
| Timezone storage | `parseAsET()` in `src/app/api/events/submit/route.ts` |
| Auth providers | `src/lib/auth.ts` |
| Geocoding logic | `src/lib/geocode.ts` |
| Email templates | `src/lib/email.ts` |
| Database schema | `prisma/schema.prisma` then `npx prisma db push` |
| Map marker shapes | `src/components/events/events-map-view.tsx` |
| Calendar tile style | `src/components/events/events-month-calendar.tsx` |
| List card style | `src/components/events/event-card.tsx` (+ compact/tile variants) |
| Instructor card | `src/components/instructors/instructor-card.tsx` (+ compact/tile) |
| Event detail page | `src/components/events/event-details-view.tsx` |
| Instructor profile UI | `src/components/instructors/instructor-profile-view.tsx` |
| Instructor edit form | `src/components/instructors/instructor-profile-editor.tsx` |
| View density behavior | `src/lib/useViewMode.ts` + `src/components/view-mode-toggle.tsx` |
| PWA config | `next.config.js` |
| Domain redirect | `vercel.json` |
| Global theme | `tailwind.config.ts` |
