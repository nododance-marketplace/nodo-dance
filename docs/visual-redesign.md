# Nodo Dance visual redesign

Direction: bright community, based on `Brand and Company Manual/Nodo_Dance_Brand_Bible_v2.pdf` and the original brand assets. Uses Hallmark's redesign workflow.

## Changed

- Shared Satoshi typography, warm white surfaces, navy structure, soft community colors and readable sunset CTAs.
- Original Nodo emblem featured intact on the homepage. Dance-style colors continue to come from the existing centralized mapping.
- Responsive navigation, directories, cards, calendar, details, profiles, account/dashboard, forms, authentication, admin and Websites page.
- Keyboard focus, reduced-motion handling, input edge contrast, mobile spacing, and accessible names for icon controls.
- Homepage title changed from `nodo dance` to `Find your next dance.`; the logo preserves the brand name. Removed the unsupported largest-community claim per the brand manual. Concise helper copy changes do not change product claims or pricing.

## Preserved

API routes, database schema, authentication/authorization, queries, event filters and views, form fields, validation, handlers, saved items and request flows. No dependencies added to the application. Existing local settings and supplied brand manual are untouched.

Presentation-related interactions: Websites video has native playback controls and respects reduced motion. The map legend now fits below its map. These do not change data or business logic.

## Review

Run `npm run dev` to use the application at http://localhost:3000. Local screenshots and Hallmark's comparison are in `.hallmark/` (intentionally ignored by git). Nothing was committed, pushed or published.

## Validation and environment limits

- TypeScript and production build pass.
- Homepage Hallmark render preserves all 10 recorded link destinations, with no open Floor or Reflex findings. White surfaces are retained on record because the supplied manual specifies them.
- Desktop and phone views captured for homepage, events, instructors, sign-in, event submission, instructor onboarding and Websites.
- The configured Neon database is unreachable locally. The existing API failure/empty states are therefore visible, and authenticated data-driven flows cannot be fully exercised.
- Cloudinary credentials are absent locally, so image uploads cannot be verified. Existing Next.js metadata and Browserslist warnings are unrelated to this UI change.
