# Nodo Dance — Database Schema Reference

> Full field-by-field reference from `prisma/schema.prisma`. Last updated: 2026-04-24.

- **Provider**: PostgreSQL (Neon)
- **Migration approach**: `npx prisma db push` only — do NOT use `prisma migrate dev` (legacy SQLite migration lock).

---

## Connection

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`DATABASE_URL` is pooled (PgBouncer-compatible), `DIRECT_URL` is non-pooled for `prisma db push`.

---

## Models

### `User`
Central account record. Default role is `DANCER`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | `@default(cuid())` |
| `email` | `String` | `@unique` |
| `emailVerified` | `DateTime?` | NextAuth standard |
| `name` | `String?` | Optional display name |
| `role` | `String` | `@default("DANCER")` — values: `DANCER` \| `INSTRUCTOR` |
| `image` | `String?` | Avatar URL (from OAuth or upload) |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations**: `accounts[]`, `sessions[]`, `instructorProfile?`, `submittedEvents[]`, `savedInstructors[]`, `savedEvents[]`

---

### `Account` (NextAuth standard)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `userId` | `String` | FK → `User`, onDelete: Cascade |
| `type` | `String` | |
| `provider` | `String` | e.g. `google`, `email` |
| `providerAccountId` | `String` | |
| `refresh_token` | `String?` | |
| `access_token` | `String?` | |
| `expires_at` | `Int?` | |
| `token_type` | `String?` | |
| `scope` | `String?` | |
| `id_token` | `String?` | |
| `session_state` | `String?` | |

**Unique**: `(provider, providerAccountId)`

---

### `Session` (NextAuth standard)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `sessionToken` | `String` | `@unique` |
| `userId` | `String` | FK → `User`, onDelete: Cascade |
| `expires` | `DateTime` | 30-day TTL set by auth config |

---

### `VerificationToken` (NextAuth standard)

| Field | Type | Notes |
|-------|------|-------|
| `identifier` | `String` | User email |
| `token` | `String` | `@unique` |
| `expires` | `DateTime` | |

**Unique**: `(identifier, token)`

---

### `InstructorProfile`

1:1 with `User`. Publicly addressable by `slug`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `userId` | `String` | `@unique`, FK → `User`, onDelete: Cascade |
| `slug` | `String` | `@unique`, generated via `slugify` |
| `displayName` | `String` | |
| `headline` | `String?` | Short tagline |
| `bio` | `String?` | Long-form |
| `photoUrl` | `String?` | Cloudinary URL |
| `styles` | `String` | JSON array, e.g. `'["Salsa","Bachata"]'` |
| `otherStyle` | `String?` | Free text when "Other" chosen |
| `skillLevels` | `String` | JSON array |
| `offerings` | `String` | JSON array, `@default("[]")` |
| `languages` | `String` | JSON array, `@default("[]")` |
| `yearsTeaching` | `Int?` | |
| `studentsTaught` | `Int?` | |
| `certifications` | `String?` | Newline-separated |
| `rating` | `Float` | `@default(4.9)` — placeholder until reviews ship |
| `offersPrivate` | `Boolean` | `@default(false)` |
| `privateRateHourly` | `Int?` | Hourly rate in whole dollars |
| `offersGroup` | `Boolean` | `@default(false)` |
| `groupRatePerClass` | `Int?` | Per-class rate |
| `groupClassNotes` | `String?` | e.g. "Tuesdays 7pm at Studio X" |
| `locationType` | `String?` | `STUDIO` \| `DANCE_SCHOOL` \| `TRAVEL_TO_STUDENT` \| `FLEXIBLE` |
| `neighborhood` | `String?` | |
| `address` | `String?` | |
| `travelRadiusMiles` | `Int?` | |
| `paymentCash` | `Boolean` | `@default(false)` |
| `paymentVenmo` | `String?` | Venmo handle |
| `paymentCashApp` | `String?` | CashApp handle |
| `paymentPayPal` | `String?` | PayPal handle/email |
| `contactEmail` | `String?` | **Soft-gated** — visible only to logged-in users |
| `preferredContactMethod` | `String?` | `Email` / `Instagram DM` / `Website Form` / `Text` |
| `contactNotes` | `String?` | **Soft-gated** — e.g. "best time to reach me: evenings" |
| `isDJ` | `Boolean` | `@default(false)` |
| `djStyles` | `String?` | JSON array of DJ styles (reuses `DANCE_STYLES`) |
| `instagramUrl` | `String?` | |
| `websiteUrl` | `String?` | |
| `bookingUrl` | `String?` | External booking/calendar link (Calendly, etc.) |
| `youtubeUrl` | `String?` | YouTube video URL (rendered as embed via `getYouTubeEmbedUrl`) |
| `tiktokUrl` | `String?` | |
| `isPublished` | `Boolean` | `@default(true)` |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Relations**: `lessonRequests[]`, `savedBy[]` (SavedInstructor)

---

### `Event`

All date fields stored as UTC. Write via `parseAsET()` (submit route), read via timezone-aware formatters.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `status` | `String` | `@default("PENDING")` — values: `PENDING` \| `APPROVED` \| `REJECTED` |
| `title` | `String` | |
| `eventType` | `String` | `SOCIAL` \| `TANGO_MILONGA` \| `GROUP_CLASS` \| `WORKSHOP` \| `FESTIVAL` |
| `styles` | `String` | JSON array |
| `otherStyle` | `String?` | Free text when "Other" chosen |
| `startDateTime` | `DateTime` | UTC |
| `endDateTime` | `DateTime?` | UTC |
| `venueName` | `String` | |
| `address` | `String?` | |
| `lat` | `Float?` | Set by geocoder |
| `lng` | `Float?` | Set by geocoder |
| `price` | `Int?` | `null` means free |
| `organizerName` | `String` | |
| `organizerEmail` | `String` | |
| `instagramUrl` | `String?` | |
| `websiteUrl` | `String?` | |
| `description` | `String` | |
| `imageUrl` | `String?` | Cloudinary URL |
| `submittedByUserId` | `String?` | FK → `User`, onDelete: SetNull |
| `isRecurring` | `Boolean` | `@default(false)` |
| `recurrenceGroupId` | `String?` | UUID shared across a series |
| `recurrenceDay` | `Int?` | 0=Sun .. 6=Sat |
| `recurrenceInterval` | `Int?` | 1=weekly, 2=biweekly |
| `recurrenceCount` | `Int?` | Total occurrences in the series |
| `recurrenceIndex` | `Int?` | 1-based position (e.g. 3 of 12) |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

**Indexes**: `status`, `startDateTime`, `eventType`, `recurrenceGroupId`

**Relations**: `submittedBy?` (User), `savedBy[]` (SavedEvent)

---

### `LessonRequest`

Student → Instructor contact, created by public lesson request form.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `instructorProfileId` | `String` | FK → `InstructorProfile`, onDelete: Cascade |
| `studentName` | `String` | |
| `studentEmail` | `String` | |
| `studentPhone` | `String?` | |
| `style` | `String` | |
| `lessonType` | `String` | `PRIVATE` \| `GROUP` \| `EITHER` |
| `preferredTimes` | `String` | Free text |
| `message` | `String` | Min 10 chars (enforced in API) |
| `createdAt` | `DateTime` | `@default(now())` |

**Index**: `instructorProfileId`

---

### `SavedInstructor`

Bookmark join table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `userId` | `String` | FK → `User`, onDelete: Cascade |
| `instructorId` | `String` | FK → `InstructorProfile`, onDelete: Cascade |
| `createdAt` | `DateTime` | `@default(now())` |

**Unique**: `(userId, instructorId)` | **Index**: `userId`

---

### `SavedEvent`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `userId` | `String` | FK → `User`, onDelete: Cascade |
| `eventId` | `String` | FK → `Event`, onDelete: Cascade |
| `createdAt` | `DateTime` | `@default(now())` |

**Unique**: `(userId, eventId)` | **Index**: `userId`

---

### `RateLimitEntry`

Persistent counter used by `checkRateLimit()` in `src/lib/rate-limit.ts`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String` PK | cuid |
| `identifier` | `String` | IP or email |
| `action` | `String` | e.g. `submit-event`, `lesson-request` |
| `count` | `Int` | `@default(1)` |
| `windowStart` | `DateTime` | `@default(now())` |

**Unique**: `(identifier, action)` | **Index**: `(identifier, action, windowStart)`

---

## JSON Array Fields — Parsing

`styles`, `skillLevels`, `offerings`, `languages`, `djStyles` are stored as JSON-serialized strings. Parse with:

```ts
import { parseJsonArray } from '@/lib/utils'
const styles = parseJsonArray(instructor.styles)  // string[]
```

`parseJsonArray` returns `[]` on null/undefined or invalid JSON (defensive).

---

## Cascade Behavior

- Deleting a `User` cascades to: Account, Session, InstructorProfile, SavedInstructor, SavedEvent
- Deleting an `InstructorProfile` cascades to: LessonRequest, SavedInstructor
- Deleting an `Event` cascades to: SavedEvent
- `Event.submittedByUserId` uses `SetNull` — deleting the submitter preserves the event but detaches the user

---

## Migrations

1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` (use DIRECT_URL when running locally)
3. Prisma Client regenerates automatically via `postinstall` or explicit `npx prisma generate`

**Do NOT run `prisma migrate dev`** — the stale SQLite migrations in `prisma/migrations/` will cause `P3019`.
