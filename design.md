# Nodo Dance visual system

Hallmark redesign, 2026-11-04. Presentation only: preserve routes, data fetching, auth, handlers, form fields, prices, claims, and backend behavior.

Use the existing Satoshi font and Nodo logo. Theme: bright community, per Brand and Company Manual/Nodo_Dance_Brand_Bible_v2.pdf with the existing navy (#1B1F3B) and coral (#FF6F61) identity, warm white (#F5F5F3), white surfaces, and dark coral (#B84235) for readable accent text. All new colors use CSS tokens in src/app/tokens.css and Tailwind's existing semantic names. Restrained sunset gradients on emphasized CTAs with navy text for contrast. Solid navy standard buttons, fine borders, 12px card corners, 8px controls. Restrained shadows. No uppercase tracked labels, no transition-all. Retain status colors and dance-style coding.

Shared CSS classes: page-shell (centered 1280px, responsive gutters, generous vertical padding), page-heading (large Satoshi heading), page-intro (muted intro), page-header (responsive flex heading/actions with bottom rule), filter-panel (quiet bordered surface), section-panel (padded surface), data-card (hover border only), form-page (narrow centered form). Shared primitives supply the controls and surfaces. Global focus-visible and reduced-motion handling apply everywhere.

App screens retain task-focused density. Public directories get prominent left-aligned headings and distinct toolbars. Profiles/events use generous imagery and clear metadata groups. Forms retain every field and action with improved section spacing. Mobile layouts must fit 320px and reserve space for bottom navigation. Keep all factual text, link destinations, conditional rendering, and component exports.

The home page uses oversized typography with the authoritative connected-dancer emblem, warm peach surface, and dance-style labels using the canonical color mapping. Keep all logo geometry intact. Soft peach, lilac and teal surfaces signal community, while functional screens remain restrained. Do not invent events, metrics, testimonials, or photos. Existing work/kizombapaixao media is a website showcase, not a standalone dance photo.

