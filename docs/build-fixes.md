# Nodo Dance — Build Fixes & Known Issues

> Running list of build/deploy issues and their resolutions. Last updated: 2026-04-24.

## Build Status
**PASSING** on `main`.

## Build Command
```json
"build": "next build --webpack"
"dev":   "next dev --webpack"
```

---

## Issue 1: Turbopack vs Webpack (RESOLVED)
**Error**: `"This build is using Turbopack, with a webpack config and no turbopack config…"`

**Root cause**: `next-pwa` v5 injects a webpack config via its wrapper in `next.config.js`. Next.js 16 defaults to Turbopack for builds, which can't use webpack configs.

**Fix**: Added `--webpack` flag to both `dev` and `build` scripts in `package.json`. Forces webpack bundler.

**Why not migrate to Turbopack?** `next-pwa` v5 is abandoned (last release 2022) and has no Turbopack support. Removing PWA would lose offline functionality.

**Config** (`next.config.js`):
```js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] }
}
module.exports = withPWA(nextConfig)
```

## Issue 2: Next 16 Promise Params (RESOLVED)
**Error**: `Type '{ params: { id: string; }; }' does not satisfy the constraint 'PageProps'. params is expected to be a Promise`

**Root cause**: Next.js 15+ changed dynamic route page props to require `params` as a `Promise`. Generated types in `.next/types/` enforce this.

**Fix**:
```typescript
// BEFORE (Next 14 style)
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params

// AFTER (Next 15+ style)
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
```

**Files fixed**:
- `src/app/events/[id]/page.tsx` — `params: Promise<{ id: string }>`
- `src/app/instructors/[slug]/page.tsx` — `params: Promise<{ slug: string }>`

## Issue 3: useSearchParams Suspense Boundary (RESOLVED)
**Error**: `useSearchParams() should be wrapped in a suspense boundary at page "/events"`

**Root cause**: Next.js 15+ requires client components using `useSearchParams()` to be wrapped in `<Suspense>` for static generation.

**Fix**: Wrapper + content split:
```typescript
export default function EventsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <EventsContent />
    </Suspense>
  )
}

function EventsContent() {
  const searchParams = useSearchParams()
  // ... rest
}
```

**Files fixed**:
- `src/app/events/page.tsx`
- `src/app/auth/signin/page.tsx`

## Issue 4: react-leaflet v5 ERESOLVE (RESOLVED)
**Error**: Vercel `npm install` fails with ERESOLVE — `react-leaflet@5.0.0` requires `react@^19` but project uses `react@^18.3.0`.

**Root cause**: react-leaflet v5 dropped React 18 support. Local npm may use `--legacy-peer-deps` but Vercel's strict install fails.

**Fix**: Downgraded `react-leaflet` from `^5.0.0` to `^4.2.1`. v4 API is identical for our usage (`MapContainer`, `TileLayer`, `Marker`, `Popup`).

Also moved `@types/leaflet` from `dependencies` to `devDependencies`.

## Issue 5: Events/Instructors Crash — "not iterable" / "map is not a function" (RESOLVED)
**Error**: `/events` crashes with `events is not iterable`, `/instructors` crashes with `instructors.map is not a function`.

**Root cause**: Both API routes returned `{ error: "..." }` (an object) on Prisma errors; clients did `setEvents(data)` and iterated.

**Fix** (defense-in-depth at 3 layers):
1. **API routes**: catch returns `[]` instead of `{ error: "..." }` — `/api/events` and `/api/instructors`
2. **Client pages**: `const arr = Array.isArray(data) ? data : []`
3. **groupEventsByDate**: early-returns empty Map if input isn't an array

## Issue 6: Auth Adapter Conflict (RESOLVED, historical)
**Error**: `@auth/prisma-adapter` is for Auth.js v5, not NextAuth v4.

**Fix**: Uninstalled `@auth/prisma-adapter`, installed `@next-auth/prisma-adapter@^1.0.7`.

## Issue 7: Prisma Migration Lock (ONGOING)
**Error**: `P3019 — datasource provider postgresql doesn't match migration_lock.toml sqlite`

**Root cause**: Project started on SQLite, migrated to PostgreSQL (Neon). Old migration files have the SQLite lock.

**Workaround**: Always use `npx prisma db push` instead of `npx prisma migrate dev`. `db push` doesn't use migration history.

## Issue 8: Prisma Generate EPERM on Windows (COSMETIC)
**Error**: `EPERM: operation not permitted, rename query_engine-windows.dll.node`

**Root cause**: VSCode's TypeScript server holds a file lock on the Prisma query engine DLL. `prisma generate` can't rename while locked.

**Impact**: None. Client regenerates on next dev start. Only appears when running `prisma generate` or `prisma db push` while VSCode is open.

## Issue 9: .env `DIRECT_URL` Format (RESOLVED)
**Error**: `P1013 — scheme is not recognized in database URL`

**Root cause**: DIRECT_URL in `.env` was pasted as `psql 'postgresql://...'` (psql prefix + quotes) instead of the raw URL.

**Fix**: Removed the `psql '` prefix and trailing `'`.

## Issue 10: Timezone Bug (7 PM → 2 PM) (RESOLVED)
**Problem**: User enters 7:00 PM. On Vercel (UTC servers), `new Date("2026-02-27T19:00")` creates 7 PM UTC = 2 PM ET. Events displayed 5 hours early.

**Fix**: Added `parseAsET()` in `src/app/api/events/submit/route.ts` — interprets form input as ET wall-clock time and stores UTC. Display functions in `src/lib/utils.ts` use `timeZone: 'America/New_York'`. Edit mode uses `toDateInputValue()` / `toTimeInputValue()`.

**Files**: `src/lib/utils.ts`, `src/app/api/events/submit/route.ts`, `src/app/submit-event/page.tsx`, `src/app/admin/admin-panel.tsx`

## Issue 11: Google OAuth Redirect Mismatch (Error 400) (RESOLVED)
**Problem**: `NEXTAUTH_URL` not set on Vercel → NextAuth falls back to `VERCEL_URL` (deployment-specific) → mismatch with Google Cloud Console redirect URIs.

**Fix**: Set `NEXTAUTH_URL=https://nododance.com` in Vercel env vars. Created `vercel.json` with 301 redirect from `nodo-dance.vercel.app` → `nododance.com`. Added debug logging at `src/lib/auth.ts` cold start (logs resolved base URL and expected Google callback).

**Files**: `src/lib/auth.ts`, `vercel.json`

## Issue 12: One-Off Event Submission Failing (RESOLVED)
**Problem**: Non-recurring event submission failed with "recurrenceWeeks: Expected number, received string" because `react-hook-form` included `recurrenceWeeks: ""` and `recurrenceInterval: "1"` even when `isRecurring` was false.

**Fix**:
- Frontend strips recurrence fields from payload when `isRecurring` is false
- Backend uses `z.preprocess` to coerce empty strings to `undefined` and numeric strings to numbers

**Files**: `src/app/submit-event/page.tsx`, `src/app/api/events/submit/route.ts`

## Issue 13: Geocoding Failure with Suite/Unit Addresses (RESOLVED)
**Problem**: Addresses like "123 Main St Ste 200, Charlotte, NC" returned no Nominatim results.

**Fix**: Added `sanitizeAddress()` that strips Suite/Ste/Apt/Apartment/Unit/#/Bldg/Building/Floor/Fl/Room/Rm tokens. `geocodeAddress()` tries original first, then retries with sanitized version. Original address preserved in DB.

**Files**: `src/lib/geocode.ts`

## Issue 14: Map Not Showing Social Events (RESOLVED)
**Problem**: Social events appeared in Calendar/List but not Map. Root cause: missing lat/lng (geocoding failed on submit).

**Fix**: Added dev-only `console.warn` in events page for events dropped due to missing coords (logs id, title, eventType, lat, lng). Real fix is the geocoding improvement (Issue 13) plus admin re-geocode and bulk re-geocode actions in `/api/admin/events`.

**Files**: `src/app/events/page.tsx`, `src/app/api/admin/events/route.ts`

## Issue 15: File Uploads Lost on Vercel Redeploy (RESOLVED)
**Problem**: Originally saved uploads to local `/uploads/` directory — lost on every Vercel deploy (ephemeral filesystem).

**Fix**: Migrated to Cloudinary. Event images → `nodo-dance/events`, profile photos → `nodo-dance/instructors` with face-detection crop.

**Files**: `src/lib/cloudinary.ts`, `src/app/api/upload/event-image/route.ts`, `src/app/api/upload/profile-photo/route.ts`

---

## Build Warnings (NON-BLOCKING)
- `themeColor` metadata warnings on multiple pages — Next.js wants it in `viewport` export instead of `metadata`. Cosmetic only.
- ESLint `no-img-element` warnings — using `<img>` instead of `next/image`. Functional, just not optimized.
- ESLint `react-hooks/exhaustive-deps` on instructors page — `fetchInstructors` not in useEffect deps array. Works fine.

## Environment Variable Validation (NEW)
Cold-start validation now logs fatal errors if required env vars are missing:
- `src/lib/auth.ts`: `EMAIL_SERVER_HOST`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD`, `EMAIL_FROM`
- `src/lib/cloudinary.ts`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- Additional debug logging for `NEXTAUTH_URL`, `VERCEL_URL`, and resolved Google OAuth callback URL
