# Nodo Dance — Future Roadmap

> Living document. Updated 2026-04-24.

---

## Short Term (Next 1-3 months)

### Save Events & Instructors — Polish
- Already implemented (`SavedEvent`, `SavedInstructor` models, toggle APIs, heart icons)
- Add count badges and "Saved" filter toggle on dashboard tabs
- Empty states when nothing is saved

### Email Notifications
- Notify users when saved events are updated/cancelled
- Weekly digest email: upcoming events in your preferred styles
- Instructor notification when profile views reach milestones

### Text Notifications (SMS)
- Add optional phone number to user profile
- Twilio integration for event reminders (day-before)
- Opt-in only, respect quiet hours

### Instructor Contact Flow Polish
- Auto-populate `contactEmail` on profile creation from account email
- "Last active" indicator on profiles
- Track "Email Instructor" click-through for instructor analytics
- Add WhatsApp as a preferred contact method (schema supports via `preferredContactMethod`)

### Event Submission UX
- Draft autosave (already implemented, polish UX around indicator)
- Event duplication ("Submit similar event") — pre-fill form from existing event
- Bulk import from CSV for organizers with many events
- Calendar subscription for series owners

### Recurring Events Polish
- UI to visualize all N occurrences before committing
- "Skip next" / "This one only" edits (currently editSeries OR single)
- Automatic end-of-series reminder for organizers

### ICS Export
- "Add to Google Calendar" / "Add to Apple Calendar" buttons on event detail
- Shared calendar feed per dance style

---

## Medium Term (3-6 months)

### Premium Instructor Badges
- "Verified" badge for instructors who complete identity verification
- "Featured" badge (paid tier) — appears at top of search results
- Badge logic in `InstructorCard` and `InstructorProfileView`

### Real Ratings & Reviews
- Replace placeholder `rating Float @default(4.9)` with real averages
- Students rate instructors after lessons (only from those who used the contact flow)
- Review moderation for admins

### Analytics Dashboard
- For instructors: profile views, contact clicks, lesson requests over time
- For admins: event submissions, user growth, style popularity
- Simple chart using lightweight library (recharts or chart.js)

### Instructor Lead Tracking (CRM-lite)
- Instructors see a log of students who contacted them
- Status tracking: inquiry → scheduled → completed
- Stored in new `InstructorLead` model

### City Expansion Structure
- `NEXT_PUBLIC_CITY` already parameterized
- Add city selector in header/footer
- Events and instructors filtered by city
- Schema: add `city` field to Event and InstructorProfile
- Subdomain or path-based routing: `/charlotte/events`, `/atlanta/events`

### Event Organizer Dashboard
- Organizers with multiple events see a dedicated view
- Track saves per event
- Edit all events in one place

### DJ Directory
- `isDJ` flag and `djStyles` already exist on InstructorProfile
- Dedicated `/djs` page with filter by style, booking URL prominent
- "Book a DJ" flow parallel to lesson requests

---

## Long Term (6-12+ months)

### Multi-City Architecture
- City as a first-class entity in the data model
- City-specific landing pages with SEO
- Local admin per city (community moderators)
- Shared instructor profiles across cities (travel radius)

### Mobile App (React Native / Expo)
- Reuse API routes (same backend)
- Push notifications for event reminders
- Location-based "events near me" with GPS
- Offline-capable event list

### Community Messaging
- In-app messaging between students and instructors
- Group chats for recurring event attendees
- Moderation tools for admins
- WebSocket or polling-based real-time updates

### Monetization Model
- **Free tier**: submit events, create instructor profile, browse
- **Pro Instructor** ($X/month): featured badge, analytics, lead tracking, priority support
- **Event Organizer** ($X/month): bulk event management, promoted events, RSVP tracking
- **City Sponsorship**: local businesses sponsor the city page
- Never gate core browsing behind a paywall

### Two-Way Calendar Sync
- Two-way sync for instructors: block times, auto-update availability
- Integration with Calendly / Acuity for booking

---

## Technical Debt & Cleanup

### Known Items
- `user.email` was previously leaked in instructor list API — fixed, but audit other endpoints
- `eventType` / `status` / `role` are `String` in Prisma, not enums — intentional for flexibility, but consider a validation layer
- `styles` / `skillLevels` / `djStyles` / etc. stored as JSON strings — works but makes DB queries harder; consider join tables when scaling
- Rate limiting uses dual LRU+DB approach — may need Redis at scale
- No automated tests yet — add API route tests and component tests
- PWA configured but not fully optimized (no offline support, no push notifications)
- `next-pwa` is abandoned — migrate to `@ducanh2912/next-pwa` or `serwist`
- `rating` placeholder value (4.9) on all profiles — swap to calculated average once reviews ship
- Case-sensitive search on Postgres — add `mode: 'insensitive'` to relevant `contains` filters

### Recommended Next Cleanups
1. Add `city` field to Event and InstructorProfile models
2. Create API route tests with vitest
3. Add OpenGraph meta tags to event detail pages for social sharing
4. Implement proper error boundaries for client components
5. Add `loading.tsx` skeletons for all dynamic routes
6. Migrate off `next-pwa` to a maintained replacement
7. Convert JSON-array fields to proper relations where it matters for query performance
