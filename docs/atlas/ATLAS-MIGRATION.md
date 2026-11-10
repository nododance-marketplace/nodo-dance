# Nodo Atlas — Database Migration Plan

> Schema additions and the production migration procedure. Last updated: 2026-11-09.
> **Status: schema applied to production. First worldwide publish done on 2026-11-09
> (1,139 events → Neon, 1,218 Atlas-origin total). See §8 for the 443 transport rule.**

---

## 1. Constraint that shapes this migration

`prisma/migrations/` contains **stale SQLite migrations** and `migration_lock.toml`
pins the `sqlite` provider. `prisma migrate dev` fails with **P3019**, and
`prisma migrate deploy` would attempt to replay SQLite DDL against Neon Postgres.

> **Therefore Atlas ships as a `db push`, not a migration.** This is the same
> mechanism the project already uses for every schema change. It is also why
> Atlas's schema changes are strictly **additive** — `db push` will happily drop
> columns that are no longer in the schema file, and a destructive change must
> never be made by editing `prisma/schema.prisma` in place.

Two options exist for the long term, and neither is decided here:

| Option | Trade-off |
|---|---|
| Baseline the migrations directory against Neon, then use `migrate dev` properly | Correct long-term, but requires reconciling every historical migration. High risk, do it deliberately. |
| Keep `db push` and add a schema-drift check to CI | Cheap, keeps today's workflow. Accepts that history is not replayable. |

**Recommendation:** stay on `db push` for Atlas, add a CI step that fails when
`prisma/schema.prisma` and the live database disagree, and schedule the
migration-baselining work as a separate, well-planned piece of work.

---

## 2. What is being added

### 2.1 New tables (ingestion layer — the web app ignores all of them)

| Model | Purpose | Key relationships |
|---|---|---|
| `DiscoveryCity` | A metro area Atlas is tracking | → `DiscoverySource` |
| `DiscoverySource` | A registered website: permissions, health, schedule | → `CrawlJob`, `RawExtraction`, `CandidateEvent`, `SourceEvidence`, `SourceHealth`, `CandidateSchool` |
| `CrawlJob` | A unit of scheduled work | → `CrawlAttempt` |
| `CrawlAttempt` | One execution of a job: status, timing, cost, candidates | → `CrawlJob` |
| `RawExtraction` | The raw structured payload pulled from a page (audit trail) | → `DiscoverySource` |
| `CandidateEvent` | An extracted event awaiting a decision | → `DiscoverySource`, `SourceEvidence`, `EntityMatch`, `RecurrenceRule`, `ModerationDecision`, `PublicationRecord` |
| `CandidateSchool` | An extracted school/studio business record | → `DiscoverySource` |
| `CandidateVenue` | A normalised venue with a canonical address key | standalone |
| `CandidateInstructor` | A public instructor listing (minimal data only) | standalone |
| `RecurrenceRule` | A detected series: RRULE, horizon, exceptions, expiry | → `CandidateEvent` |
| `SourceEvidence` | Per-field provenance for a candidate | → `DiscoverySource`, `CandidateEvent` |
| `EntityMatch` | A proposed duplicate/series relationship | → `CandidateEvent` |
| `ModerationDecision` | An append-only log of human decisions | → `CandidateEvent` |
| `PublicationRecord` | What was published, from which candidate, with a snapshot | → `CandidateEvent` |
| `SourceHealth` | Rolling crawl health per source per window | → `DiscoverySource` |
| `Venue` | A canonical venue entity (dedupes venues across events) | → `Event` |

### 2.2 New columns on `Event`

All **nullable** so existing rows are untouched.

| Column | Type | Why |
|---|---|---|
| `timeZone` | `String?` | IANA zone. The app currently hard-codes `America/New_York`; a nationwide marketplace cannot. |
| `city` | `String?` | Display, grouping, coverage reporting |
| `state` | `String?` | Display, coverage reporting |
| `zip` | `String?` | Display, geocoding fallback |
| `venueId` | `String?` | FK to `Venue` — today the venue is a free-text string repeated on every row |
| `sourceId` | `String?` | FK to `DiscoverySource` — the provenance anchor |
| `sourceUrl` | `String?` | Original listing URL, shown to users |
| `sourceName` | `String?` | Organization name as published |
| `publishedVia` | `String @default("ORGANIZER")` | `ORGANIZER` \| `ATLAS` \| `MANUAL` — distinguishes scraped from human-entered |
| `verifiedAt` | `DateTime?` | When the source last confirmed this record |
| `atlasCandidateId` | `String?` | The candidate this event was published from |
| `claimedByUserId` | `String?` | Organizer claim |
| `claimedAt` | `DateTime?` | When the organizer claimed it |
| `claimStatus` | `String?` | `PENDING` \| `VERIFIED` \| `REJECTED` |

### 2.3 Indexes added on `Event`

```
@@index([sourceId])
@@index([city, state])
```

`city, state` is the index that makes the public map and the coverage reports
fast once the marketplace goes nationwide.

---

## 3. Safety properties

| Property | How it is guaranteed |
|---|---|
| No existing row is modified | Every new column is nullable or has a default |
| No existing row is deleted | `db push` only drops columns that are *absent from the schema file*; nothing is being removed |
| The web app still works if Atlas is disabled | The ingestion tables are separate; `Event` keeps every field it had |
| Rollback is trivial | Drop the new tables and the new columns — no data the site depends on lives there |
| Publishing is reversible | `PublicationRecord` records the snapshot; `Event.publishedVia = 'ATLAS'` identifies exactly which rows to unpublish |

```sql
-- Rollback (run only after confirming nothing published by Atlas must be kept)
DROP TABLE IF EXISTS "SourceHealth", "PublicationRecord", "ModerationDecision",
  "EntityMatch", "SourceEvidence", "RecurrenceRule", "CandidateInstructor",
  "CandidateVenue", "CandidateSchool", "CandidateEvent", "RawExtraction",
  "CrawlAttempt", "CrawlJob", "DiscoverySource", "DiscoveryCity" CASCADE;
ALTER TABLE "Event" DROP COLUMN IF EXISTS "claimedAt",
  DROP COLUMN IF EXISTS "claimedByUserId", DROP COLUMN IF EXISTS "claimStatus",
  DROP COLUMN IF EXISTS "atlasCandidateId", DROP COLUMN IF EXISTS "verifiedAt",
  DROP COLUMN IF EXISTS "publishedVia", DROP COLUMN IF EXISTS "sourceName",
  DROP COLUMN IF EXISTS "sourceUrl", DROP COLUMN IF EXISTS "sourceId",
  DROP COLUMN IF EXISTS "venueId", DROP COLUMN IF EXISTS "zip",
  DROP COLUMN IF EXISTS "state", DROP COLUMN IF EXISTS "city",
  DROP COLUMN IF EXISTS "timeZone";
DROP TABLE IF EXISTS "Venue";
```

---

## 4. Migration procedure

> **Requires explicit approval. Do not run without it.**

### Step 0 — Pre-flight

```bash
# 1. Confirm the local schema matches the intended production schema.
npx tsx atlas/scripts/gen-local-schema.ts
npx prisma validate --schema atlas/prisma/schema.local.prisma

# 2. Take a backup. Neon keeps point-in-time recovery, but export anyway.
#    npx prisma db pull --schema ./backup/schema.prisma
#    pg_dump "$DIRECT_URL" > backup-$(date +%Y%m%d).sql

# 3. Confirm the site is green before touching the schema.
npm run build
```

### Step 1 — Apply (additive)

```bash
# Dry run first: prisma prints the statements it would run.
npx prisma db push --schema prisma/schema.prisma --preview-feature

# Then apply. Neon supports transactional DDL, so a failure leaves no partial state.
npx prisma db push --schema prisma/schema.prisma
```

> `db push` does **not** prompt for confirmation on additive changes, but it
> **does** warn and require `--accept-data-loss` if it would drop anything.
> Read that warning carefully — it is the last line of defence.

### Step 2 — Verify

```sql
-- Every new table exists.
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('DiscoveryCity','DiscoverySource','CrawlJob','CrawlAttempt',
  'RawExtraction','CandidateEvent','CandidateSchool','CandidateVenue',
  'CandidateInstructor','RecurrenceRule','SourceEvidence','EntityMatch',
  'ModerationDecision','PublicationRecord','SourceHealth','Venue')
ORDER BY table_name;

-- The new Event columns exist and are nullable.
SELECT column_name, is_nullable, column_default FROM information_schema.columns
WHERE table_name = 'Event' AND column_name IN
  ('timeZone','city','state','zip','venueId','sourceId','sourceUrl',
   'sourceName','publishedVia','verifiedAt','atlasCandidateId',
   'claimedByUserId','claimedAt','claimStatus')
ORDER BY column_name;

-- Nothing was lost.
SELECT count(*) AS total_events,
       count(*) FILTER (WHERE "publishedVia" = 'ORGANIZER') AS organizer_events
FROM "Event";
```

### Step 3 — Backfill (optional, safe, reversible)

Existing rows stay `publishedVia = 'ORGANIZER'`. Backfilling the timezone makes the
data honest about where each event happens:

```sql
-- Only Charlotte-area events are known to be Eastern Time.
UPDATE "Event"
SET "timeZone" = 'America/New_York'
WHERE "timeZone" IS NULL
  AND "address" ILIKE '%NC%';

-- Mark what we know about the city.
UPDATE "Event" e
SET "city" = 'Charlotte', "state" = 'NC'
WHERE e."city" IS NULL
  AND e."address" ILIKE '%charlotte%';
```

Both statements are idempotent and affect only rows where the column is still
NULL. Roll them back with `SET "timeZone" = NULL WHERE "publishedVia" = 'ORGANIZER'`.

### Step 4 — Deploy

```bash
npm run build
# Deploy through your normal Vercel path (git push to main, or `vercel`).
```

The app is backwards-compatible with the new schema before the deploy and after it,
so the schema push and the code deploy can happen in either order. **Push the
schema first** — the new code reads fields that do not exist until it does.

---

## 5. Credentials and boundaries

The ingestion worker should **not** hold the web app's production credentials.

| Principal | Sees | Why |
|---|---|---|
| Web app (Vercel) | All tables | It serves the site |
| Atlas worker | `Discovery*`, `Crawl*`, `RawExtraction`, `Candidate*`, `RecurrenceRule`, `SourceEvidence`, `EntityMatch`, `ModerationDecision`, `PublicationRecord`, `SourceHealth` | It writes candidates, not live listings |
| Publisher (a separate, human-triggered step) | `Event` INSERT/UPDATE | Publishing is a distinct, deliberate act |

**Pilot recommendation:** run the pilot against a **Neon branch** of the production
database. A branch is a full copy that can be reset in one click, so an experiment
can never damage production data.

```bash
# Create a branch (Neon CLI or console), then:
DATABASE_URL="postgresql://...branch-host/db?sslmode=require" \
DIRECT_URL="postgresql://...branch-host/db?sslmode=require" \
npx prisma db push --schema prisma/schema.prisma
```

**Production recommendation:** grant the worker a restricted role limited to the
Atlas tables plus `INSERT` on `Event` only when a publication is explicitly
approved by an admin action.

---

## 6. Local proof-of-concept schema

The pilot does **not** touch Neon. It uses a SQLite copy derived mechanically from
the production schema so the two can never drift:

```
prisma/schema.prisma   (postgres — the source of truth)
        │
        │  atlas/scripts/gen-local-schema.ts
        │  (rewrites the datasource provider + generator output)
        ▼
atlas/prisma/schema.local.prisma   (sqlite — proof of concept)
        │
        ▼
atlas/prisma/atlas.db   (local file, gitignored)
```

The script fails loudly if the schema shape changes and the replacement no longer
applies, so a silent divergence is not possible.

---

## 7. Post-migration checklist

- [ ] `SELECT count(*)` on `Event` matches the pre-migration count
- [ ] `/events`, `/instructors`, `/` and `/admin` render normally
- [ ] `/admin/atlas` loads and shows an empty funnel
- [ ] `/api/atlas/tick` returns 503 until `CRON_SECRET` is set (never 200 by accident)
- [ ] `CRON_SECRET` is set in the Vercel environment
- [ ] A source registered in staging appears in the registry and can be crawled
- [ ] No public listing is published without a human decision
- [ ] A rollback statement has been tested against the branch database

---

## 8. Publishing from the dev box — the port-443 rule

`atlas/scripts/neon-sync.ts` is the one-shot operator tool for getting the
reviewed local state into Neon and publishing it:

```
npx tsx atlas/scripts/neon-sync.ts --sync            # merge local atlas state (idempotent, inert)
npx tsx atlas/scripts/neon-sync.ts --publish --yes   # dedupe + approve + publish QA-passed candidates
```

It exists because this dev box cannot complete the Postgres TLS handshake on
5432 (TCP opens, TLS is reset by something between here and us-east-1, so the
Prisma CLI/engine and `--target=production` fail), while Neon's HTTP driver on
port 443 works. Everything runs through Neon's `Pool`
(`webSocketConstructor: ws`), not the regular Prisma client.

Merge semantics (nothing is deleted, ids of the older production pilot are
preserved):

| Table | Key | Behaviour |
|---|---|---|
| `DiscoveryCity` | slug | reuse the existing id, insert only unknown slugs |
| `DiscoverySource` | url | reuse the existing id; new sources are queued (`nextCrawlAt` nulled) for the worker |
| `CandidateEvent` | local cuid id | inserted fresh with `sourceId` remapped onto the merged registry |

Publish semantics (`--publish --yes`):

1. Load candidates with `qaStatus = 'PASS'`, `reviewStatus in ('PENDING','APPROVED')`, not expired.
2. Group by `dedupeKey + city` — keep the highest-confidence row; discard keys
   already present on a `PUBLISHED` candidate.
3. Mark duplicates `MERGED`, mark keepers `APPROVED`, both with a
   `ModerationDecision` audit row (`decidedBy = atlas-bulk`).
4. Insert `Event` rows (`publishedVia = 'ATLAS'`, `status = 'APPROVED'`,
   `timeZone` from the source city), then `PublicationRecord` plus the
   candidate → `PUBLISHED` flip.

Re-runs are safe: already-moved rows are skipped (the loader selects only
PENDING/APPROVED candidates, and an existing `Event.atlasCandidateId` is
reused, never duplicated).
