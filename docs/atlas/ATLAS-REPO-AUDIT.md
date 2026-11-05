# Nodo Atlas — Repository Audit

> Repository audit for Nodo Atlas. Last updated: 2026-11-04.

This document records what the Nodo Dance repository actually contains today, what
is missing, and what the Atlas ingestion layer changes. It is written against the
working tree at commit `20a1a83` plus the uncommitted Atlas work. Every claim below
names the file it came from.

---

## 1. Method and baseline

Two states matter, and they are different:

| State | Definition | Used for |
|---|---|---|
| **Baseline** | `prisma/schema.prisma` as committed at `20a1a83` (git HEAD) | What the live Neon database and the running production app actually have |
| **Atlas working tree** | The uncommitted edits to `prisma/schema.prisma`, plus the new `atlas/`, `src/app/api/atlas/`, `src/app/api/admin/atlas/`, `src/app/admin/atlas/` and `src/components/admin/atlas/` trees | What Atlas adds |

`git status` at the time of writing:

```
 M prisma/schema.prisma        (422 insertions — the Atlas layer)
 M vercel.json                 (one cron entry added)
 M src/app/admin/admin-panel.tsx
 M .gitignore                  (atlas/generated/, .cache/, atlas/prisma/atlas.db ignored)
?? atlas/
?? docs/atlas/
?? src/app/admin/atlas/
?? src/app/api/admin/atlas/
?? src/app/api/atlas/
?? src/components/admin/
```

The Atlas schema edits have **not** been pushed to Neon. `atlas/README.md` lists this
as open item 3: *"The schema in `prisma/schema.prisma` is additive but **has not been
pushed to Neon**. It needs `npx prisma db push` plus a review of the `Event` column
additions. Requires explicit approval."*

That distinction drives most of this document. Where the brief says a field does not
exist, it does not exist **in the baseline, in the live database, and in the running
production app**. It does exist in the uncommitted working tree.

---

## 2. Stack inventory

Versions are the ranges declared in `package.json`.

### Runtime dependencies

| Package | Version | What it is actually used for |
|---|---|---|
| `next` | `^16.1.6` | App Router web app, all API routes, `/admin`, `/admin/atlas`. Also hosts the Vercel Cron target `/api/atlas/tick` |
| `react` / `react-dom` | `^18.3.0` | UI. React 18 with Next 16 — Next 16 supports it, but the app has not moved to React 19 |
| `next-auth` | `^4.24.13` | v4 API. Google OAuth + EmailProvider magic link. `session.strategy: 'database'` |
| `@next-auth/prisma-adapter` | `^1.0.7` | Persists `User`, `Account`, `Session`, `VerificationToken` into Postgres |
| `@prisma/client` | `^5.11.0` | ORM for every model. `@prisma/client` is generated into `node_modules/.prisma` for the web app |
| `zod` | `^3.22.4` | Server-side validation in `src/app/api/events/submit/route.ts` and the admin routes |
| `react-hook-form` | `^7.51.0` | Event submission and instructor profile forms |
| `@hookform/resolvers` | `^3.3.4` | `zodResolver` bridge for react-hook-form |
| `nodemailer` | `^7.0.13` | SMTP transport for magic links, event submission notices, lesson request confirmations |
| `cloudinary` | `^2.9.0` | Profile photo and event image upload (`src/lib/cloudinary.ts`) |
| `leaflet` | `^1.9.4` | Map renderer for `/events?mapMode=1` |
| `react-leaflet` | `^4.2.1` | React bindings for the map view |
| `next-pwa` | `^5.6.0` | Service worker / installable PWA (`public/sw.js`) |
| `date-fns` | `^3.3.1` | Calendar month-grid math in `src/lib/calendar-utils.ts` only |
| `slugify` | `^1.6.6` | `InstructorProfile.slug` generation in the two profile editors |
| `clsx` + `tailwind-merge` | `^2.1.0` / `^2.2.1` | The `cn()` class helper in `src/lib/utils.ts` |
| `lru-cache` | `^10.2.0` | In-memory tier of the two-tier rate limiter (`src/lib/rate-limit.ts`) |
| `lucide-react` | `^0.358.0` | Icon set |
| `sonner` | `^2.0.7` | Toast notifications, including in the Atlas admin screen |

`nanoid ^5.1.6` is declared but **is not imported anywhere** in `src/`, `scripts/`,
`prisma/` or `atlas/`. Ids come from Prisma's `@default(cuid())`, `crypto.randomUUID()`
and `stableHash()` in `atlas/lib/normalize.ts`. It is dead weight in the manifest.

### Dev dependencies

| Package | Version | Use |
|---|---|---|
| `typescript` | `^5.4.0` | Whole repo, `strict` via `tsconfig.json` |
| `tsx` | `^4.7.1` | Runs `atlas/cli.ts`, `atlas/scripts/test.ts`, `prisma/seed.ts`, and the one-off `scripts/*.ts` |
| `tailwindcss` | `^3.4.0` + `postcss` `^8.4.0` + `autoprefixer` | Utility CSS |
| `eslint` | `^9.39.2` + `eslint-config-next` `^16.1.6` | `npm run lint` → `next lint` |
| `prisma` | `^5.11.0` | CLI. The `postinstall` script runs `prisma generate` |
| `@types/*` | — | Node, React, React DOM, Leaflet, Nodemailer |

### What Atlas deliberately did not add

Atlas has **no new npm dependency**. `atlas/lib/parsers/html.ts` is a hand-written
scanner rather than `cheerio` or `jsdom`, and `atlas/lib/parsers/dates.ts` is
hand-written rather than `date-fns`/`chrono-node`. The stated reason, in the module
header, is that the target pages are server-rendered and a targeted scanner is
smaller, faster and easier to test than a general DOM.

The unit suite has no test framework either. `atlas/scripts/test.ts` is ~270 lines of
`check()` / `eq()` calls and exits non-zero on failure.

---

## 3. The existing data model (baseline)

Seven application models plus the three NextAuth models:

| Model | Purpose |
|---|---|
| `User` | Account. Role is a plain string, default `DANCER` |
| `Account`, `Session`, `VerificationToken` | NextAuth v4 standard |
| `InstructorProfile` | 1:1 with `User`, publicly addressable by `slug` |
| `Event` | The listing. This is the model Atlas extends |
| `SavedEvent` | User → Event bookmark |
| `SavedInstructor` | User → InstructorProfile bookmark |
| `LessonRequest` | Student → Instructor contact form |
| `RateLimitEntry` | Persistent rate-limit counter |

### `Event` — field by field (baseline)

All `DateTime` values are stored as UTC. Writes go through `parseAsET()`; reads go
through the timezone-aware formatters in `src/lib/utils.ts`.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` PK | cuid |
| `status` | `String` | `@default("PENDING")` — values `PENDING` \| `APPROVED` \| `REJECTED` |
| `title` | `String` | |
| `eventType` | `String` | `SOCIAL` \| `TANGO_MILONGA` \| `GROUP_CLASS` \| `WORKSHOP` \| `FESTIVAL` |
| `styles` | `String` | JSON array of `DANCE_STYLES` |
| `otherStyle` | `String?` | Free text when `Other` is chosen |
| `startDateTime` | `DateTime` | UTC |
| `endDateTime` | `DateTime?` | UTC |
| `venueName` | `String` | **Plain string. There is no `Venue` entity.** |
| `address` | `String?` | Free text, one line, no structure |
| `lat` | `Float?` | Written by the Nominatim geocoder |
| `lng` | `Float?` | Written by the Nominatim geocoder |
| `price` | `Int?` | `null` means free |
| `organizerName` | `String` | |
| `organizerEmail` | `String` | |
| `instagramUrl` | `String?` | |
| `websiteUrl` | `String?` | |
| `description` | `String` | |
| `imageUrl` | `String?` | Cloudinary URL |
| `submittedByUserId` | `String?` | FK → `User`, `onDelete: SetNull` |

#### Recurrence fields on `Event`

A recurring submission is **materialised as N rows**, not stored as a rule. The rows
share a `recurrenceGroupId` and each carries its own position.

| Field | Type | Notes |
|---|---|---|
| `isRecurring` | `Boolean` | `@default(false)` |
| `recurrenceGroupId` | `String?` | UUID shared across every row of one series (`crypto.randomUUID()`) |
| `recurrenceDay` | `Int?` | `0` = Sunday .. `6` = Saturday |
| `recurrenceInterval` | `Int?` | `1` = weekly, `2` = biweekly |
| `recurrenceCount` | `Int?` | Total occurrences in the series. Denormalised onto every row |
| `recurrenceIndex` | `Int?` | 1-based position — "3 of 12" |

**Indexes**: `status`, `startDateTime`, `eventType`, `recurrenceGroupId`.

Because the series is N rows, the schedule is only correct as long as every row's
`startDateTime` is correct. That is exactly where the DST bug lives (§8).

### The other application models (baseline, condensed)

| Model | Key fields |
|---|---|
| `User` | `email` (unique), `name?`, `role` (string, default `DANCER`), `image?`, `createdAt`, `updatedAt`. Relations: `accounts[]`, `sessions[]`, `instructorProfile?`, `submittedEvents[]`, `savedInstructors[]`, `savedEvents[]` |
| `InstructorProfile` | `userId` (unique FK), `slug` (unique), `displayName`, `headline?`, `bio?`, `photoUrl?`, `styles`, `otherStyle?`, `skillLevels`, `offerings`, `languages`, `yearsTeaching?`, `studentsTaught?`, `certifications?`, `rating` (default `4.9`), `offersPrivate`, `privateRateHourly?`, `offersGroup`, `groupRatePerClass?`, `groupClassNotes?`, `locationType?`, `neighborhood?`, `address?`, `travelRadiusMiles?`, `paymentCash`, `paymentVenmo?`, `paymentCashApp?`, `paymentPayPal?`, `contactEmail?` (**soft-gated**), `preferredContactMethod?`, `contactNotes?` (**soft-gated**), `isDJ`, `djStyles?`, `instagramUrl?`, `websiteUrl?`, `bookingUrl?`, `youtubeUrl?`, `tiktokUrl?`, `isPublished`, `createdAt`, `updatedAt` |
| `SavedEvent` | `userId` + `eventId`, unique `(userId, eventId)` |
| `SavedInstructor` | `userId` + `instructorId`, unique `(userId, instructorId)` |
| `LessonRequest` | `instructorProfileId`, `studentName`, `studentEmail`, `studentPhone?`, `style`, `lessonType`, `preferredTimes`, `message`, `createdAt` |
| `RateLimitEntry` | `identifier` (IP or email), `action`, `count`, `windowStart`. Unique `(identifier, action)` |

---

## 4. Gaps Atlas fills

| # | Gap | Evidence in the baseline | What Atlas adds (working tree) |
|---|---|---|---|
| 1 | **No timezone field.** The whole app is hard-coded to Eastern Time | `src/lib/utils.ts:23` — `export const APP_TIMEZONE = 'America/New_York'`. Every formatter in the file passes `timeZone: APP_TIMEZONE` | `Event.timeZone String?` (IANA). `DiscoveryCity.timeZone` is the source of truth per city; `CandidateEvent.timeZone` is per record; `RecurrenceRule.timeZone` is per rule |
| 2 | **No city / state / zip on `Event`** | `Event` has only a free-text `address` and a `venueName` string | `Event.city`, `Event.state`, `Event.zip`, plus `@@index([city, state])` |
| 3 | **No venue entity** — the venue is a plain string | `Event.venueName String` | New `Venue` model: `name`, `address`, `city`, `state`, `zip`, `lat`, `lng`, `timezone`, `websiteUrl`, `normalizedAddress` (`@unique`). `Event.venueId` FK with `onDelete: SetNull`. `CandidateVenue` exists alongside it for the ingestion side |
| 4 | **No provenance / source field** — nothing records where a listing came from | `Event` has `websiteUrl` (the organizer's own link) but no ingestion trail | `Event.sourceId` (→ `DiscoverySource`), `Event.sourceUrl`, `Event.sourceName`, `Event.publishedVia` (`ORGANIZER` \| `ATLAS` \| `MANUAL`), `Event.verifiedAt`, `Event.atlasCandidateId` |
| 5 | **No claim concept** — an organizer cannot claim a scraped listing | Nothing in the baseline | `Event.claimedByUserId`, `Event.claimedAt`, `Event.claimStatus` (`PENDING` \| `VERIFIED` \| `REJECTED`) |
| 6 | **No moderation history** — `status` is a bare string | `Event.status String @default("PENDING")` — one field, three values, no record of who decided what | `ModerationDecision` model (`candidateEventId`, `decision`, `decidedBy`, `reason`, `createdAt`), `CandidateEvent.reviewStatus` / `reviewedBy` / `reviewedAt`, `PublicationRecord` (with `snapshot`), `EntityMatch`, `SourceEvidence` |
| 7 | **No timezone on `InstructorProfile`** | `InstructorProfile` has `address?` and `neighborhood?` only | `InstructorProfile.timeZone` is **not** added in the current working tree — it remains an open gap (see §11) |
| 8 | **No place for a human to review scraped data** | The only admin screen is `/admin`, which lists `Event` rows | `/admin/atlas` with three tabs — Review queue, Source registry, Coverage — backed by `/api/admin/atlas/{candidates,sources,overview}` |
| 9 | **No scheduler** | `vercel.json` had only the domain redirect | `crons: [{ path: "/api/atlas/tick", schedule: "0 6 * * *" }]` |

---

## 5. The public write path — `src/app/api/events/submit/route.ts`

```
POST /api/events/submit
  │
  ├─ 1. AUTH — getServerSession(authOptions); no session.user.email → 401 AUTH_REQUIRED
  ├─ 2. VALIDATE — Zod schema.parse(body); failure → 400 with the Zod error array
  │      title, eventType (enum), styles[], startDate, startTime, address,
  │      organizerName, organizerEmail (email), description, honeypot (max 0),
  │      isRecurring, recurrenceWeeks (2..52), recurrenceInterval (1..2)
  ├─ 3. HONEYPOT — data.honeypot non-empty → 400
  ├─ 4. RATE LIMIT — checkRateLimit({ identifier: ip, action: 'submit-event',
  │      limit: 10, window: 3600 }) → 429 when over
  │      · ip = getClientIp(req) = first entry of x-forwarded-for
  │      · admins bypass; EVENT_RATE_LIMIT_ENABLED=false disables
  ├─ 5. PARSE — parseAsET(startDate, startTime) → correct UTC instant
  ├─ 6. GEOCODE — buildGeoQuery(venueName, address) → geocodeAddress() → lat/lng
  ├─ 7. INSERT
  │      · one-off      → prisma.event.create({ status: 'PENDING', ... })
  │      · recurring    → prisma.event.createMany({ ... N rows ... })
  └─ 8. NOTIFY — sendEventSubmissionEmail() → ADMIN_EMAILS
```

`PUT /api/events/submit` handles editing; owner-or-admin only. With
`editSeries: true` it strips `startDateTime`/`endDateTime` and runs
`updateMany` over `recurrenceGroupId`, so per-occurrence dates survive an edit.
`DELETE` is owner-only and can delete a whole series.

### Recurrence materialisation — and the bug

```typescript
// src/app/api/events/submit/route.ts:131-141
const dayOfWeek = new Date(`${data.startDate}T12:00:00Z`).getUTCDay()

const eventsData = Array.from({ length: weeks }, (_, i) => {
  const occStart = new Date(startDateTime.getTime() + i * interval * 7 * 24 * 60 * 60 * 1000)
  const occEnd = endDateTime
    ? new Date(endDateTime.getTime() + i * interval * 7 * 24 * 60 * 60 * 1000)
    : null
  ...
```

`i * interval * 7 * 24 * 60 * 60 * 1000` is fixed millisecond arithmetic. 168 hours is
not always 7 local days. See §8.

### The other write paths

| Route | Method | Auth | Writes |
|---|---|---|---|
| `/api/events/submit` | `POST` | Session required | `Event` (status `PENDING`) |
| `/api/events/submit` | `PUT` | Owner or admin | `Event`; `updateMany` over `recurrenceGroupId` for series edits |
| `/api/events/submit` | `DELETE` | Owner only | `Event` or the whole series |
| `/api/admin/events` | `PUT` | Admin | `Event.status`, `Event.lat/lng` |
| `/api/admin/events` | `DELETE` | Admin | `Event` or the whole series |
| `/api/upload/{profile-photo,event-image}` | `POST` | Session required | Cloudinary, then `imageUrl`/`photoUrl` |
| `/api/lesson-requests` | `POST` | Session required | `LessonRequest` |

---

## 6. The admin moderation path — `src/app/api/admin/events/route.ts`

```typescript
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null
  }
  return session
}
```

`isAdmin()` lives in `src/lib/auth.ts:152` and is the only definition of admin in the
system:

```typescript
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || []
  if (adminEmails.includes(email)) return true
  return false
}
```

There is **no admin role in the database**. `User.role` holds only `DANCER` or
`INSTRUCTOR`. Admin authority is an environment-variable email list, evaluated on
every request.

### Actions

| Request | Effect |
|---|---|
| `GET` | All events, newest first, with `submittedBy.email` |
| `PUT { eventId, status: 'APPROVED' \| 'REJECTED' }` | Sets `Event.status`. On approval, geocodes if `lat`/`lng` are missing. Then `revalidatePath('/events')` and `revalidatePath('/events/${id}')` |
| `PUT { eventId, seriesAction: 'approve-series' }` | `updateMany` over `recurrenceGroupId` → `APPROVED`. Geocodes once and applies the coordinates to every row |
| `PUT { eventId, seriesAction: 'reject-series' }` | `updateMany` over `recurrenceGroupId` → `REJECTED` |
| `PUT { action: 'geocode', eventId }` | Forces a re-geocode of one event. Failure → 422 |
| `PUT { action: 'geocode-all' }` | Finds every event with a null `lat` or `lng` and a non-null `address`, geocodes each, with a 1100 ms delay between calls to respect the Nominatim limit |
| `DELETE { eventId, deleteSeries }` | Deletes one event, or the whole series when `deleteSeries` is true |

The moderation surface is **binary**. `PENDING`, `APPROVED`, `REJECTED`. There is no
record of who approved what, when, or why — the `Event` table has no `reviewedBy` or
`reviewedAt` column in the baseline, and `approvedVia`/`approvedBy` do not exist.

---

## 7. Geocoding — `src/lib/geocode.ts`

OpenStreetMap Nominatim. No API key, no account, no quota.

| Property | Value |
|---|---|
| Endpoint | `https://nominatim.openstreetmap.org/search` |
| Query params | `format=json`, `limit=1`, `q=<query>` |
| User-Agent | `NodoDance/1.0 (nodo-dance-app)` |
| Fallback | If the first lookup fails, `sanitizeAddress()` strips suite/unit/floor tokens and the query is retried |
| Failure | Returns `null`. The event saves without coordinates and simply does not appear on the map |

`sanitizeAddress()` removes `suite|ste|apt|apartment|unit|#|bldg|building|floor|fl|room|rm`
tokens, using a negative lookbehind so the pattern does not fire inside words.

**Properties of the module that matter for a crawler:**

- **No cache.** Every call is a fresh HTTP request to Nominatim.
- **No rate limiting inside the module.** The only politeness is the hard-coded
  `await new Promise(r => setTimeout(r, 1100))` in the admin `geocode-all` action.
  The submit route and the single-event geocode path have no delay at all.
- **No response size cap, no timeout.** `fetch()` without a signal.
- **Identifiable but generic User-Agent.** It names the product but carries no
  contact address, which Nominatim's usage policy asks for.

`buildGeoQuery(venueName, address)` uses the full address when present, and falls
back to `"<venueName>, <NEXT_PUBLIC_CITY>, NC"` — note the hard-coded `, NC` — when
only the venue name is available.

---

## 8. The DST bug

### What happens

Recurring occurrences are generated by adding a fixed number of milliseconds. In
`America/New_York` a week is 168 hours for five weeks a year and 169 hours for two.
The arithmetic in the submit route assumes it is always 168.

Starting from a correct 7:00 PM ET base on Wednesday 2026-03-04:

```
DST-correct (reference)              Buggy (current submit route)
2026-03-04 19:00 ET → 2026-03-05T00:00Z   2026-03-04 19:00 ET → 2026-03-05T00:00Z
2026-03-11 19:00 ET → 2026-03-11T23:00Z   2026-03-12 19:00Z → 2026-03-11 20:00 ET  ← drift
2026-03-18 19:00 ET → 2026-03-18T23:00Z   2026-03-19 19:00Z → 2026-03-18 20:00 ET  ← drift
2026-03-25 19:00 ET → 2026-03-25T23:00Z   2026-03-26 19:00Z → 2026-03-25 20:00 ET  ← drift
```

The 2026 US DST transition is **Sunday 2026-03-08**. Every occurrence after that
date is one hour late in local wall time. A 7:00 PM class becomes an 8:00 PM class
on the public calendar, and the error does not correct itself until the November
transition, where it drifts back.

The second transition is 2026-11-01. A series created before March and running
through November drifts +1 hour from March to November and returns to the intended
time from November onward.

### Where the bug lives

| File | Line | Code |
|---|---|---|
| `src/app/api/events/submit/route.ts` | 134-136 | `new Date(startDateTime.getTime() + i * interval * 7 * 24 * 60 * 60 * 1000)` and the same for `endDateTime` |
| `scripts/extend-recurring-events.ts` | 110-111 | `const offsetMs = (i + 1) * intervalDays * 24 * 60 * 60 * 1000` then `new Date(anchorStart.getTime() + offsetMs)` |

`scripts/extend-recurring-events.ts` has the identical defect: it extends a series by
adding whole days of milliseconds to the last existing occurrence, so a series
extended across a DST boundary lands at the wrong local hour.

### `recurrenceDay` is **not** affected

The brief describes the same bug appearing in the `recurrenceDay` derivation. In the
current code it does not:

```typescript
// src/app/api/events/submit/route.ts:131
const dayOfWeek = new Date(`${data.startDate}T12:00:00Z`).getUTCDay()
```

The weekday is read from the **user's input date string** at noon UTC, before any
timezone conversion, so it is the intended local weekday and is immune to DST.
Verified empirically: under the buggy arithmetic, `getUTCDay()` stays constant at
`4` (Wednesday) for every occurrence.

Adding 168 hours always advances the UTC weekday by exactly seven, and the DST
shift is one hour — well under the 24 hours it would take to change the weekday.
So `recurrenceDay` is stable; only the **time of day** drifts.

There is a separate, real hazard in the same function. `parseAsET()` parses
`etStr` with `new Date(etStr)` where `etStr` is a locale string such as
`"3/4/2026, 2:00:00 PM"`. `new Date(string)` interprets that in the **host's**
timezone. The function is therefore correct only on a UTC host (Vercel) and wrong
on an Eastern-local host:

```
host TZ = UTC      → 2026-03-04T19:00Z input  → 2026-03-05T00:00:00Z  ✓ correct
host TZ = New_York → 2026-03-04T19:00Z input  → 2026-03-04T19:00:00Z  ✗ 4h early
```

This is a distinct bug from the recurrence drift and is out of scope for the Atlas
work, but it will bite anyone running the app locally on an Eastern clock.

### The reference implementation Atlas ported

`.hallmark/extend-june-classes.cjs` contains the correct approach. It is a
standalone Node script that talks to Neon directly, and it solves the wall-clock →
UTC conversion with a fixed-point iteration:

```javascript
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})

function local(d) {                       // UTC instant → local wall string
  const p = Object.fromEntries(fmt.formatToParts(new Date(d)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}

function utc(wall) {                      // local wall string → UTC instant
  const naive = Date.parse(wall + 'Z')
  let value = naive
  for (let i = 0; i < 3; i++) {
    const delta = Date.parse(local(value) + 'Z') - naive
    value -= delta
    if (!delta) break
  }
  return new Date(value).toISOString()
}
```

The key property: **the schedule is iterated in wall-clock space** (`cursor += interval * 7 * 86400000` on a naive wall-clock value) and each occurrence is converted to UTC independently, rather than adding milliseconds to a UTC instant.

The script even asserts its own conversion before writing anything:

```javascript
if (local('2026-06-01T23:00:00') !== '2026-06-01T19:00:00' ||
    utc('2026-11-09T19:00:00') !== '2026-11-10T00:00:00.000Z' ||
    utc('2026-06-01T19:00:00') !== '2026-06-01T23:00:00.000Z') throw Error('Timezone verification failed')
```

That assertion is what caught the original drift: the June series had been stored at
8:00 PM when the source said 7:00 PM, and the November series at 7:00 PM when the
source said 8:00 PM. The corrections are recorded in
`.hallmark/class-extension-plan.json` and `.hallmark/class-extension-receipt.json`
(177 rows inserted, 177 rows corrected).

### How Atlas fixes it

`atlas/lib/recurrence.ts` ports the same two-pass offset resolution, in
TypeScript, as `wallTimeToUtc(localDate, localTime, timeZone)`:

```typescript
const offsetAt = (utcMs: number): number => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, ... }).formatToParts(new Date(utcMs))
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), ...)
  return asUtc - utcMs
}

let guess = naiveUtc - offsetAt(naiveUtc)
guess = naiveUtc - offsetAt(guess)
return new Date(guess)
```

and `expandOccurrences()` walks the series in **calendar space** using `addDays()`
on `YYYY-MM-DD` strings — the same discipline as the hallmark script. The inverse
`utcToWallTime()` is provided for assertions.

The same helper is duplicated in the admin publish route at
`src/app/api/admin/atlas/candidates/route.ts:186` (`localToUtc`), which the comment
marks as "mirrors atlas/lib/recurrence.ts".

---

## 9. Deployment reality

### Crons

`vercel.json` had no `crons` block before Atlas. The Atlas work added exactly one:

```json
"crons": [
  { "path": "/api/atlas/tick", "schedule": "0 6 * * *" }
]
```

`src/app/api/atlas/tick/route.ts` sets `export const dynamic = 'force-dynamic'` and
`export const maxDuration = 300`. It selects due sources
(`isPaused: false`, `optOut: false`, `permissionsStatus: { not: 'DENIED' }`,
`nextCrawlAt <= now`), capped by `ATLAS_MAX_SOURCES` (default 10, hard max 50), and
writes `CrawlJob` rows. `ATLAS_MODE` defaults to `enqueue`.

**The endpoint refuses to run without `CRON_SECRET`:**

```typescript
if (!secret) {
  return NextResponse.json(
    { error: 'CRON_SECRET is not configured — the Atlas scheduler is disabled.' },
    { status: 503 }
  )
}
if (auth !== `Bearer ${secret}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

`CRON_SECRET` is not in `.env` or `.env.example`.

### The migration situation

`prisma/migrations/` holds five migrations from February 2026, all written for
SQLite:

```
prisma/migrations/migration_lock.toml            → provider = "sqlite"
prisma/migrations/20260213062417_auth_fix/
prisma/migrations/20260213064705_add_instructor_premium_fields/
prisma/migrations/20260213155447_add_saved_instructors_events/
prisma/migrations/20260213192039_add_event_image_url/
prisma/migrations/20260213194128_change_default_role_to_dancer/
```

But the datasource in `prisma/schema.prisma` is:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

The provider mismatch makes `prisma migrate dev` fail with **P3019** — *"The
datasource provider `postgresql` specified in your schema does not match the one
specified in the migration_lock.toml, `sqlite`."* The repo's own docs already carry
the warning (`docs/DATABASE_SCHEMA.md`: *"Do NOT run `prisma migrate dev` — the stale
SQLite migrations in `prisma/migrations/` will cause `P3019`."*).

The project therefore uses `prisma db push` only — `package.json` exposes it as
`npm run db:push`, and `docs/SYSTEM_OVERVIEW.md` step 2 of production setup is
`npx prisma db push`.

### What this constrains for Atlas

1. **No migration history.** Every schema change is a `db push`, which Prisma
   implements as a diff against the live database, not as an ordered SQL script.
   There is no rollback artefact except a manual `git revert` of the schema file.
2. **The Atlas tables are additive, which is what makes `db push` safe here.** The
   new models (`DiscoveryCity`, `DiscoverySource`, `CrawlJob`, `CrawlAttempt`,
   `RawExtraction`, `CandidateEvent`, `CandidateSchool`, `CandidateVenue`,
   `CandidateInstructor`, `RecurrenceRule`, `SourceEvidence`, `EntityMatch`,
   `ModerationDecision`, `PublicationRecord`, `SourceHealth`, `Venue`) are all new
   tables. The `Event` changes are new nullable columns plus two indexes, except
   `Event.publishedVia` which is `String @default("ORGANIZER")` — a non-null column
   with a default, which `db push` handles as a table rewrite with a default fill on
   Postgres.
3. **The Pilot DB is not the production DB.** `atlas/prisma/schema.local.prisma` is
   generated from `prisma/schema.prisma` by `atlas/scripts/gen-local-schema.ts`,
   which rewrites the datasource to `sqlite` / `ATLAS_DATABASE_URL` and the generator
   output to `../generated/local-client`. It fails loudly if the datasource shape
   changes and the replacement no longer applies. The local database is
   `atlas/prisma/atlas.db`, and the schema uses no Postgres-only features, so the
   SQLite copy is faithful.
4. **`prisma migrate deploy` is also unusable** for the same reason — it would try
   to apply SQLite SQL to Postgres.

---

## 10. Auth model

```
NextAuth v4 (next-auth ^4.24.13)
  adapter  : PrismaAdapter(prisma)      → Account / Session / User / VerificationToken
  session  : strategy 'database', maxAge 30 days
  providers: GoogleProvider (only if GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set)
             EmailProvider (magic link, custom HTML template)
  pages    : /auth/signin, /auth/verify, /auth/error
```

Session shape, from the `session` callback in `src/lib/auth.ts`:

```typescript
session.user = {
  id: string       // Prisma User.id
  email: string
  name: string
  role: string     // "DANCER" | "INSTRUCTOR"
  isAdmin: boolean // derived from the ADMIN_EMAILS env var
}
```

| Property | Value | Consequence |
|---|---|---|
| Session storage | Database (`Session` table) | Sessions survive a deploy and a cold start |
| Roles | Plain strings on `User.role` | No enum, no constraint, no admin value |
| Admin | `ADMIN_EMAILS` env var, comma-separated, compared by exact string match | Changing the env var changes authority instantly; adding a wrong email grants full admin |
| Middleware | **None.** There is no `src/middleware.ts` and no root `middleware.ts` | Every route protects itself. `requireAdmin()` in `src/app/api/admin/events/route.ts`, `requireAtlasAdmin()` in `src/app/api/admin/atlas/_lib.ts`, `getServerSession()` inline elsewhere |
| Cookie | Dev `next-auth.session-token`; prod `__Secure-next-auth.session-token`, `httpOnly`, `sameSite: 'lax'`, `secure` in production | |
| Secret | `NEXTAUTH_SECRET` | Missing → session callback cannot sign the cookie |

Consequence worth naming: because there is no middleware, a new route is
**unprotected until someone remembers to add a guard**. The Atlas routes do have
guards (`/api/admin/atlas/*` via `handle()` in `_lib.ts`, `/admin/atlas` via a
server-component redirect), but this is a convention, not a framework guarantee.

---

## 11. What Atlas changed, and what it deliberately did not change

### Changed

| Area | Change | Files |
|---|---|---|
| Schema | 16 new models (15 Atlas ingestion models plus `Venue`), `Event` gains `venueId` / `city` / `state` / `zip` / `timeZone` / `sourceId` / `sourceUrl` / `sourceName` / `publishedVia` / `verifiedAt` / `atlasCandidateId` / `claimedByUserId` / `claimedAt` / `claimStatus`, two new `Event` indexes | `prisma/schema.prisma` |
| New package | `atlas/` — CLI, 13 library modules, 5 scripts, a generated SQLite schema and client | `atlas/` |
| Admin API | `/api/admin/atlas/{candidates,sources,overview}` — review queue, source registry, coverage + kill switch | `src/app/api/admin/atlas/` |
| Admin UI | `/admin/atlas` — Review queue, Sources, Coverage tabs | `src/app/admin/atlas/page.tsx`, `src/components/admin/atlas/atlas-admin.tsx` |
| Scheduler | `/api/atlas/tick` + one `vercel.json` cron | `src/app/api/atlas/tick/route.ts`, `vercel.json` |
| Admin panel | A link to `/admin/atlas` from the existing `/admin` screen | `src/app/admin/admin-panel.tsx` |
| Gitignore | `atlas/generated/`, `.cache/`, `atlas/prisma/atlas.db` | `.gitignore` |

### Deliberately not changed

| Left alone | Why it matters |
|---|---|
| `src/app/api/events/submit/route.ts` | The public submission path keeps its own auth, honeypot, Zod schema, rate limit and email notification. Atlas does not write to `Event` through the public API |
| `src/app/api/admin/events/route.ts` | The existing admin moderation path is untouched. Atlas has its own review queue and its own publish route (`PATCH /api/admin/atlas/candidates` with `decision: 'PUBLISHED'`) |
| `src/lib/geocode.ts` | Atlas candidates carry `lat`/`lng` as extracted; it does not call Nominatim from the worker |
| `src/lib/auth.ts` | The `isAdmin()` env-var model is unchanged. Atlas admin routes reuse it rather than introducing a second authority |
| `src/lib/utils.ts` | `APP_TIMEZONE` is unchanged. Atlas carries its own `timeZone` per candidate and does not reformat anything in the web app |
| `src/lib/rate-limit.ts` | The submit-route limiter is unchanged. Atlas has its own per-domain politeness in `atlas/lib/fetcher.ts` |
| The public pages | `/events`, `/instructors`, `/event/[id]`, `/instructor/[slug]` are unchanged. Atlas data reaches them only through `Event` rows, filtered by `status = 'APPROVED'` as before |
| `prisma/migrations/` | Left alone — they are already unusable, and archiving them is a separate decision with a data-history consequence |
| `package.json` dependencies | No new runtime dependency was added |

### Known remaining gaps

| Gap | Status |
|---|---|
| `InstructorProfile.timeZone` | **Not added.** The working tree adds `Event.timeZone` but not `InstructorProfile.timeZone`. An instructor working out of state still has no timezone of their own |
| The DST bug in the submit route | **Still present.** Atlas computes occurrences correctly; it does not fix the organizer-submission path. A recurring event submitted by an organizer still drifts |
| `Event.status` history | Still a bare string on `Event`. `ModerationDecision` records decisions about *candidates*, not about `Event` rows |
| `publishedVia` backfill | `Event.publishedVia` defaults to `ORGANIZER`, so existing rows are correct by default — but there is no backfill script and no `db push` has been run |
| Search provider | Every free search endpoint is bot-challenged from this IP. `SERPER_API_KEY` is the intended answer and is not configured |

---

## 12. Key file reference

| Need to change... | Edit this file |
|---|---|
| Dance styles and event types (web app) | `src/lib/constants.ts` |
| Dance styles and event types (Atlas) | `atlas/lib/types.ts` — the `DanceStyle` and `NodoEventType` unions are duplicated, not imported |
| Timezone display | `src/lib/utils.ts` (`APP_TIMEZONE`) |
| Timezone storage for organizer submissions | `parseAsET()` in `src/app/api/events/submit/route.ts` |
| Timezone storage for scraped events | `wallTimeToUtc()` in `atlas/lib/recurrence.ts` |
| Recurrence expansion | `expandOccurrences()` in `atlas/lib/recurrence.ts` |
| Auth providers, admin list | `src/lib/auth.ts` |
| Geocoding | `src/lib/geocode.ts` |
| Robots gate | `atlas/lib/robots.ts` |
| Politeness / politeness policy | `atlas/lib/types.ts` (`DEFAULT_POLICY`), `atlas/lib/fetcher.ts` |
| Candidate persistence | `atlas/lib/pipeline.ts` |
| Entity resolution | `atlas/lib/dedupe.ts` |
| Confidence scoring and QA verdicts | `atlas/lib/qa.ts` |
| Schema | `prisma/schema.prisma` then `npx prisma db push` |
| Atlas local schema | `atlas/scripts/gen-local-schema.ts` (never hand-edit `atlas/prisma/schema.local.prisma`) |
| Scheduler | `src/app/api/atlas/tick/route.ts`, `vercel.json` |
| Admin Atlas screen | `src/app/admin/atlas/page.tsx`, `src/components/admin/atlas/atlas-admin.tsx` |
| Unit tests | `atlas/scripts/test.ts` |
