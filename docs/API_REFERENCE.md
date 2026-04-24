# Nodo Dance — API Reference

> All HTTP endpoints. Last updated: 2026-04-24. Routes live under `src/app/api/`.

**Authentication** is session-based (NextAuth, database strategy). `session?.user?.email` is required on protected endpoints. Admin endpoints additionally check `isAdmin(email)` against `ADMIN_EMAILS`.

---

## Auth

### `GET|POST /api/auth/[...nextauth]`
NextAuth default handler. Supports:
- **Google OAuth** (loaded only when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set; `allowDangerousEmailAccountLinking: true`)
- **Email magic link** via `EmailProvider` + Nodemailer SMTP
  - Custom HTML template in `src/lib/auth.ts`
  - Redirects after sign-in to `/onboarding`

---

## Events (Public)

### `GET /api/events`

List approved events.

**Query params**:
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Matches `title`, `venueName`, or `address` (case-sensitive `contains`) |
| `styles` | CSV | Dance style names (JSON array filter — client-side) |
| `eventTypes` | CSV | One of the `EVENT_TYPES` values |
| `dateFilter` | enum | `today` \| `this-week` \| `this-month` \| `upcoming` (default) |
| `mapMode` | `"1"` | When set, restricts to events with `lat` + `lng` |
| `monthStart` | ISO date | Used with `monthEnd` for calendar month query |
| `monthEnd` | ISO date | |

**Response**: `Event[]` — always an array; error cases return `[]` with HTTP 500.

**Special logic**:
- `dateFilter=today` computes ET midnight→midnight boundaries in UTC
- `[Map Debug]` log printed in `mapMode` runs (counts by `eventType` + missing coords)

---

### `POST /api/events/submit`
Create a new event (or a full recurring series).

**Auth**: required (401 `AUTH_REQUIRED`)
**Rate limit**: 10 / IP / hour (admin bypass; `EVENT_RATE_LIMIT_ENABLED=false` disables)

**Body (Zod-validated)**:
```ts
{
  title: string,
  eventType: "SOCIAL" | "TANGO_MILONGA" | "GROUP_CLASS" | "WORKSHOP" | "FESTIVAL",
  styles: string[],
  otherStyle?: string,
  startDate: string,                 // YYYY-MM-DD (ET)
  startTime: string,                 // HH:MM 24h (ET)
  endTime?: string,                  // HH:MM 24h (ET)
  venueName?: string,
  address: string,                   // min 1 char
  price?: string,                    // integer string, null → free
  organizerName: string,
  organizerEmail: string,            // valid email
  instagramUrl?: string,
  websiteUrl?: string,
  description: string,
  imageUrl?: string | null,          // Cloudinary URL
  honeypot: "",                      // must be empty
  isRecurring: boolean,
  recurrenceWeeks?: number,          // 2..52
  recurrenceInterval?: number,       // 1 (weekly) or 2 (biweekly)
}
```

**Behavior**:
- Parses date/time as ET (`parseAsET`)
- Geocodes address via `buildGeoQuery` + `geocodeAddress`
- Single event → `prisma.event.create`
- Recurring → `prisma.event.createMany` with shared `recurrenceGroupId`; sends ONE admin notification for the series
- Status: always starts as `PENDING`

**Responses**:
- `200 { success: true, id }` (single)
- `200 { success: true, recurrenceGroupId, count }` (series)
- `400 { error: "Invalid data", details: ZodError }`
- `401 { error: "AUTH_REQUIRED" }`
- `429 { error: "Too many submissions..." }`

---

### `PUT /api/events/submit`
Edit an event. Owner or admin only.

**Body**: same shape as POST, all fields optional, plus:
```ts
{ eventId: string, editSeries?: boolean }
```

**Behavior**:
- If `editSeries: true` and the event has `recurrenceGroupId`, updates all occurrences via `updateMany` and preserves per-occurrence dates
- Otherwise updates a single event
- Re-geocodes if `address` changed

---

### `DELETE /api/events/submit`
Delete an event. Owner only.

**Body**: `{ eventId: string, deleteSeries?: boolean }`
- `deleteSeries: true` deletes all rows with the same `recurrenceGroupId` (scoped to this user's submissions)

---

### `GET /api/events/my`
List current user's submitted events (or single by ID).

**Auth**: required
**Query**: `?id=<eventId>` (optional) — returns one event

---

## Instructors (Public)

### `GET /api/instructors`
List instructor profiles.

**Query params**:
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Matches `displayName` or `neighborhood` |
| `styles` | CSV | Dance styles (post-filter on JSON array) |
| `lessonType` | enum | `PRIVATE` \| `GROUP` |
| `locationType` | enum | One of `LOCATION_TYPES` values |
| `minPrice` / `maxPrice` | int | On `privateRateHourly` |
| `djOnly` | `"1"` | Filter `isDJ: true` |
| `sortBy` | enum | `recommended` (default) \| `price-low` \| `price-high` \| `most-styles` |

**Soft-gated fields**: `contactEmail` and `contactNotes` are included only when `session?.user?.email` is present.

**Response**: `InstructorProfile[]` (without `user` relation — email is never exposed via this route). Errors → `[]`.

---

## Instructor Profile (Write)

### `POST|PATCH|PUT /api/instructor-profile`
Create or upsert current user's instructor profile. Requires auth.

Body accepts the mutable fields on `InstructorProfile`. Slug is generated on create via `slugify`.

---

## Lesson Requests (Public)

### `POST /api/lesson-requests`
Submit a lesson request to an instructor. Public route (no login required).

**Rate limit**: 5 / IP / hour
**Honeypot**: `honeypot` field must be empty

**Body (Zod)**:
```ts
{
  instructorProfileId: string,
  studentName: string,
  studentEmail: string,
  studentPhone?: string,
  style: string,
  lessonType: "PRIVATE" | "GROUP" | "EITHER",
  preferredTimes: string,
  message: string,      // min 10 chars
  honeypot: "",
}
```

**Behavior**:
- Creates `LessonRequest` row
- Sends two emails via `sendLessonRequestEmail`: to instructor + confirmation to student

---

## Saved Items

### `GET /api/saved/event`
Auth required. Returns `{ ids: string[] }` of saved event IDs.

### `POST /api/saved/event`
Auth required. Toggle save. Body: `{ eventId: string }`. Returns `{ saved: boolean }`.

### `GET /api/saved/instructor`
Auth required. Returns `{ ids: string[] }`.

### `POST /api/saved/instructor`
Auth required. Toggle. Body: `{ instructorId: string }`. Returns `{ saved: boolean }`.

---

## Uploads

### `POST /api/upload/event-image`
Auth required. multipart/form-data with `file` field. Validates: JPEG/PNG/WebP, max 5MB. Uploads to Cloudinary `nodo-dance/events` folder, limits width to 1600px.

Response: `{ url: string }` (Cloudinary secure URL).

### `POST /api/upload/profile-photo`
Auth required. multipart/form-data with `file` field. Validates same as above. Uploads to `nodo-dance/instructors`, crops to 512×512 with face gravity.

---

## User

### `PUT /api/user/role`
Auth required. Body: `{ role: "DANCER" | "INSTRUCTOR" }`. Updates current user's role.

---

## Account

### `DELETE /api/account`
Auth required. Deletes the current user's account and cascades all related data (InstructorProfile → LessonRequest → SavedInstructor / SavedEvent / Account / Session).

---

## Admin (requires `isAdmin(email)`)

All admin routes return `401 Unauthorized` if the caller is not an admin.

### `GET /api/admin/events`
List all events regardless of status. Includes `submittedBy.email`.

### `PUT /api/admin/events`
Multiple actions driven by body shape.

**Single event approve/reject**:
```ts
{ eventId: string, status: "APPROVED" | "REJECTED" }
```
On `APPROVED`, auto-geocodes if `lat`/`lng` are missing. Revalidates `/events` and `/events/[id]`.

**Series approve/reject**:
```ts
{ eventId: string, seriesAction: "approve-series" | "reject-series" }
```
Updates all events with the same `recurrenceGroupId`. If approved and coords missing, geocodes once and applies to the whole series.

**Re-geocode single event**:
```ts
{ eventId: string, action: "geocode" }
```

**Bulk re-geocode all events missing coords**:
```ts
{ action: "geocode-all" }
```
Loops over all events missing `lat`/`lng`, calls Nominatim with a 1.1-second delay between requests. Returns `{ total, success, failed }`.

### `DELETE /api/admin/events`
Body: `{ eventId: string, deleteSeries?: boolean }`. If `deleteSeries: true`, deletes all events with the same `recurrenceGroupId`.

### `GET /api/admin/profiles`
List all instructor profiles (admin view).

### `DELETE /api/admin/profiles`
Body: `{ profileId: string }`. Deletes instructor profile (cascade via Prisma).

---

## Error Conventions

- List GETs (`/api/events`, `/api/instructors`) return `[]` on error rather than an object — defense-in-depth against client iteration crashes.
- Write endpoints return `{ error: "<message>" }` with an appropriate HTTP status.
- Zod validation errors: `{ error: "Invalid data", details: ZodError.errors }` with HTTP 400.
- Auth required: `{ error: "AUTH_REQUIRED" }` with HTTP 401.
- Rate limited: `{ error: "Too many ..." }` with HTTP 429.
