# SPEC — Nodo Business Platform (bookings, tickets, payments)

> Status: DRAFT for milestone planning. Owner approved the brief 2026-11-24.
> Derived from the founder's build brief (this file is the canonical copy).
> Research inputs: public Punchpass/Momence/Mindbody product pages + official
> docs, Eventbrite/Luma/TicketsCandy flows, REA (github.com/morluto/rea) for
> lawful public-observation workflows only.

## Goal

Turn Nodo's existing discovery audience (city pages, map/list/calendar,
instructor profiles, blog) into revenue for dance businesses — while keeping
the dancer-facing experience mobile-first and simple.

Four customers, one platform:

| Who | Gets |
| --- | --- |
| Independent teacher | Publish a class schedule, sell drop-ins + class packs, see bookings, mark attendance |
| Academy | Multiple instructors/locations under one business account, recurring classes, cross-studio attendance + sales |
| DJ / event organizer | Publish socials/milongas/workshops/festivals, sell tickets, attribution, door check-in |
| Dancer | Find something to attend, see price/requirements up front, book or buy on a phone, find their ticket afterward |

A business can offer both classes and events. A user can be a student at one
business, an instructor at another, and check-in staff at a third.

## Hard rules

1. **Imported vs native listings stay distinct.** Imported listings (Atlas,
   Punchpass JSON-LD, Eventbrite channels) render in discovery and link to
   their provider — they never create inventory or charge anyone. Native
   listings manage inventory, bookings and tickets in Nodo. The CTA is
   accurate per listing: Book class · RSVP · Get tickets · Book on provider's
   site. Authorized staff can link an imported listing to a native offering
   (studio migration path) or flag a duplicate for review.
2. Preserve existing public URLs, editorial content, moderation, map/list/
   calendar views, dance styles, and SEO. New pages extend the current
   design system (night theme, Satoshi fonts).
3. All pricing, inventory and access-control decisions are **server-side**.
   Client must never be trusted for capacity, price, or business-scoped data.
4. No invented platform fees. Stripe Connect product defines payouts.
5. Payments stay in sandbox until the provider is verified; free flows ship
   first. Sandbox and production accounts/secrets stay separate. Any preview
   simulation is clearly labeled and impossible to enable in production.

## Data model (to add to prisma/schema.prisma)

- `Business` — owner (User), name, slug, kind (TEACHER | ACADEMY | ORGANIZER),
  timezone, stripe account id, payout readiness.
- `BusinessMember` — business + user + role (OWNER | INSTRUCTOR | CHECKIN),
  unique per (business, user).
- `Offering` — native class or event owned by a Business. Type CLASS | EVENT.
  Class fields: style, level, duration, capacity, price, cancellation policy,
  booking window, recurrence rule (reuse Event's proven recurrence pattern:
  groupId + occurrence rows, local wall-time + IANA timezone, DST-safe).
  Event fields: cover image, host/DJ credits, venue, tiers.
- `ClassSession` / Event occurrences — per-occurrence rows (capacity
  overrides, cancellations) with booking history preserved.
- `ClassPack` — business-owned pack (credits, eligible styles/classes,
  expiration) + `PackPurchase`/`PackCredit` ledger. Server-enforced spend,
  restore on policy-allowed cancellation.
- `Reservation` — class booking: session, user or guest, source (account |
  pack | drop-in | waitlist), status, payment ref.
- `WaitlistEntry` — ordered, with expiring claim window for paid spots.
- `TicketTier` — per event: name (Early Bird / GA / VIP), price, sales
  window, inventory, total-event capacity enforced server-side.
- `Order` — tickets/payment state machine (hold → paid → checked-in /
  refunded / canceled), provider, amounts, webhook reconciliation fields.
- `Ticket` — unique code + QR, issued only after verified payment, check-in
  records (first scan wins; later scans report the original; refunded fails).
- `CheckIn` — who scanned, when, method (QR | manual lookup).
- Attribution: share links carry a source that survives through completed
  reservations/orders (existing DiscoverySource ids reused where possible).

## Milestones

**M1 — Free preview (first build target).** Business owner creates a weekly
class + a free social via a visible "Manage Business" entry point. Student
reserves the class; guest RSVPs to the social with secure ticket link; owner
sees both. Recurring classes with DST-safe local times; edit one occurrence /
future occurrences; cancel one class keeping history. Confirmation +
cancellation emails via existing Nodemailer infrastructure. Seed: Charlotte
academy, independent teacher, DJ/organizer, beginner salsa class, free social.
Runs on a preview deployment against an isolated test database.

**M2 — Paid preview.** Stripe Connect test mode: seller onboarding (hosted),
paid drop-in + paid ticket tier, expiring inventory holds, tickets issued only
after verified payment, QR + manual check-in at the door, refunds, signed
webhooks with idempotent/out-of-order handling. Apple Pay/Klarna via Stripe
where eligible; PayPal as a separate multiparty integration, gated. Plaid:
evaluate only if bank verification/payments are actually needed. Race test:
concurrent booking of the last spot must not oversell; second scan flagged;
refunded ticket rejected.

**M3 — Operations.** Class packs with double-spend protection, waitlist
promotion with expiring claims, CSV exports, staff permissions verified
cross-business, conversion reporting (upcoming capacity, bookings, sales,
attendance), organizer share links with attribution.

**M4 — Growth tools.** Promo codes/referrals, embeddable schedules and
ticket buttons, memberships, opt-in campaigns (marketing consent separate
from transactional email).

## Concurrency & safety requirements (apply from M1)

- Reservation/ticket creation uses transactional decrement-with-guard
  (no read-then-write), unique constraints as backstops, webhook events
  processed idempotently, duplicate requests return the original resource.
- Business-scoped data access enforced in API routes (Prisma filters by
  membership), never by hiding UI.
- Existing flows must not regress: imported events, blogs, auth, PWA.

## Open questions for the founder

RESOLVED 2026-11-24:
1. Platform fee: **0%** launch fee to onboard businesses. Stripe Connect in
   "separate charges and transfers" mode with a zero application fee; revisit
   when monetizing.
2. Stripe account: founder will reuse the Vizus Stripe account in **test
   mode** for the M2 preview. For production launch, prefer a dedicated
   NodoDance Stripe account (Connect platform identity, payouts branding,
   clean accounting) — flag at M2.
3. Brand: does the customer-facing ticket say "NodoDance" or the business name?
4. Domain strategy: booking pages under nododance.com/b/{slug} (default) or
   subdomains?

## Process

- Work on a feature branch or worktree off main; never merge to production.
- Follow AGENTS.md house workflow (spec → plan → incremental slices → tests
  → build → review). `npm run build` must pass; the webpack flag is required.
- Payment status must be reported per method as: verified in sandbox,
  simulated, or blocked with the exact dependency.
