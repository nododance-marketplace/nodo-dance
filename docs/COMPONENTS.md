# Nodo Dance — Component Catalog

> One-line purpose plus key notes for every React component in `src/components/`. Last updated: 2026-04-24.

Path prefix in this doc: `src/components/`

---

## `ui/` — Primitives

| Component | File | Notes |
|-----------|------|-------|
| Button | `ui/button.tsx` | Variants: `default`, `gradient` (coral→magenta), `outline`. Sizes: `default`, `sm`, `lg` |
| Card / CardContent | `ui/card.tsx` | Shell with rounded-xl + shadow + border |
| Input | `ui/input.tsx` | Styled text input |
| Select | `ui/select.tsx` | Styled native `<select>` |
| Textarea | `ui/textarea.tsx` | Styled textarea |
| Badge | `ui/badge.tsx` | Small label pill. Variants: `primary`, `secondary`, `outline` |
| AnimatedNodes | `ui/animated-nodes.tsx` | SVG/Canvas background animation on homepage hero |

---

## `layout/`

| Component | File | Notes |
|-----------|------|-------|
| Header | `layout/header.tsx` | Top nav bar. Role-aware: shows "Become an Instructor" for non-instructors, dashboard link scoped to role. Includes sign in / sign out |
| Footer | `layout/footer.tsx` | Nav links, Instagram (@nododance), email (nododance@gmail.com) |
| MobileNav | `layout/mobile-nav.tsx` | Mobile bottom navigation drawer |

---

## `providers/`

| Component | File | Notes |
|-----------|------|-------|
| SessionProvider wrapper | `providers/session-provider.tsx` | Wraps NextAuth's `SessionProvider` to be usable in server components |

---

## `auth/`

| Component | File | Notes |
|-----------|------|-------|
| OnboardingPicker | `auth/onboarding-picker.tsx` | Two-card role picker; calls `PUT /api/user/role` and redirects |
| EventGateModal | `auth/event-gate-modal.tsx` | Soft gate shown when unauthenticated user tries to submit an event. Lists benefits and provides "Sign in with email" + "Continue with Google" CTAs |
| LoginPromptCard | `auth/login-prompt-card.tsx` | Generic card encouraging sign-in — used where auth is optional |
| SignOutButton | `auth/sign-out-button.tsx` | Calls NextAuth `signOut()` |
| UpgradeButton | `auth/upgrade-button.tsx` | DANCER → INSTRUCTOR upgrade via `PUT /api/user/role`; redirects to profile editor |
| SaveButton | `auth/save-button.tsx` | Heart toggle for events + instructors. Calls `/api/saved/event` or `/api/saved/instructor`. Shows sign-in redirect for visitors |
| DangerZone | `auth/danger-zone.tsx` | "Delete account" section on `/account` |
| DeleteAccountModal | `auth/delete-account-modal.tsx` | Confirmation modal; calls `DELETE /api/account` |

---

## `events/`

| Component | File | Notes |
|-----------|------|-------|
| EventCard | `events/event-card.tsx` | Comfortable (default) event card. Image, title, style chips, date/time, venue, price, save button, link |
| EventCardCompact | `events/event-card-compact.tsx` | Grid card for 2-column compact density |
| EventCardTile | `events/event-card-tile.tsx` | Single-row tile for dense list density |
| EventDetailsView | `events/event-details-view.tsx` | Full event detail body: hero image, description, map embed, organizer contact, related info |
| EventsMonthCalendar | `events/events-month-calendar.tsx` | Month grid (`date-fns`); each day renders `EventChip` items colored by primary dance style. Supports month navigation |
| EventsMapView | `events/events-map-view.tsx` | Leaflet map (dynamic import, `ssr:false`). Renders Marker per event, colored by style and shaped by `eventType`. Includes legend, SVG icon cache, jitter for overlaps |

**Density modes** used on `/events`:
- Comfortable → `EventCard`
- Compact → `EventCardCompact`
- Tile → `EventCardTile`

---

## `instructors/`

| Component | File | Notes |
|-----------|------|-------|
| InstructorCard | `instructors/instructor-card.tsx` | Comfortable instructor card. Photo, name, headline, styles, pricing, location, social, save button, DJ badge |
| InstructorCardCompact | `instructors/instructor-card-compact.tsx` | Grid card for 2-column compact density |
| InstructorCardTile | `instructors/instructor-card-tile.tsx` | Single-row tile |
| InstructorProfileView | `instructors/instructor-profile-view.tsx` | Public profile page body. Renders soft-gated contact (locked card for visitors), bio, styles, pricing, payment methods, YouTube embed, social links, "Request Lesson" button |
| InstructorProfileEditor | `instructors/instructor-profile-editor.tsx` | Edit form. Multi-select styles, skill levels, offerings, languages; pricing, location, payment, DJ flag + DJ styles, social links. Photo upload via `/api/upload/profile-photo` |
| LessonRequestModal | `instructors/lesson-request-modal.tsx` | Contact modal. Form: name, email, phone, style, lesson type, preferred times, message, honeypot. Calls `POST /api/lesson-requests`. Rate-limited server-side |

---

## `account/`

| Component | File | Notes |
|-----------|------|-------|
| AccountDashboard | `account/account-dashboard.tsx` | Dancer dashboard container. Tabs: Saved Events, Saved Instructors, Settings (Danger Zone) |

---

## `dashboard/`

| Component | File | Notes |
|-----------|------|-------|
| DashboardView | `dashboard/dashboard-view.tsx` | Instructor dashboard. Lists user's submitted events, profile summary, quick actions |
| ProfileEditor | `dashboard/profile-editor.tsx` | Legacy alias — see `instructors/instructor-profile-editor.tsx` |

---

## Root-level

| Component | File | Notes |
|-----------|------|-------|
| ViewModeToggle | `view-mode-toggle.tsx` | 3-segment control for Comfortable / Compact / Tile density. Pairs with `useViewMode()` hook |

---

## Top-level Pages (not components, for reference)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Homepage with hero, How It Works (3 steps), Dance Styles grid (11 cards), Submit Event + Become Instructor CTAs, Location banner |
| `/events` | `src/app/events/page.tsx` | Calendar / List / Map tabs, filter sidebar, search, date range |
| `/events/[id]` | `src/app/events/[id]/page.tsx` | Event detail (Promise params) |
| `/instructors` | `src/app/instructors/page.tsx` | Directory with filters + density toggle |
| `/instructors/[slug]` | `src/app/instructors/[slug]/page.tsx` | Public instructor profile |
| `/instructor/dashboard` | `src/app/instructor/dashboard/page.tsx` | Instructor's events + profile |
| `/instructor/profile/edit` | `src/app/instructor/profile/edit/page.tsx` | Instructor profile editor |
| `/submit-event` | `src/app/submit-event/page.tsx` | Soft-gated event submission form |
| `/dashboard` | `src/app/dashboard/page.tsx` | Pure redirect based on role |
| `/account` | `src/app/account/page.tsx` | Dancer dashboard |
| `/admin` | `src/app/admin/page.tsx` + `admin-panel.tsx` | Admin moderation (events + profiles) |
| `/auth/signin` | `src/app/auth/signin/page.tsx` | Magic link + Google sign-in (Suspense-wrapped) |
| `/auth/verify` | `src/app/auth/verify/page.tsx` | "Check your email" confirmation |
| `/auth/error` | `src/app/auth/error/page.tsx` | Auth error page |
| `/onboarding` | `src/app/onboarding/page.tsx` | Role picker |
| `/become-an-instructor` | `src/app/become-an-instructor/page.tsx` | Upgrade CTA |
