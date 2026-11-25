# SESSION HANDOFF — M1 complete, M2 next

> Last updated: 2026-11-25, end of session. Read this before resuming.

## State of the world

- **M1 Free Preview: DONE and deployed.** Branch `feature/business-platform-m1`
  (head: emails commit `34dfea2` — all commits pushed).
- **Live preview URL:** https://nodo-dance-vercel-git-fe-f4a53a-nododance-marketplaces-projects.vercel.app
  (Vercel project `nodo-dance-vercel`; the other Vercel project `nodo-dance`
  has a pre-existing failure, unrelated — candidate for cleanup).
- **Local dev:** `npx next dev --webpack -p 3001` inside the worktree
  `C:\Users\moise\.local\share\opencode\worktree\9bc243\business-platform-m1`
  (a dev server may still be running on port 3001).
- **Canonical spec:** `docs/SPEC-BUSINESS-PLATFORM.md` — decisions recorded:
  0% platform fee, Vizus Stripe account in TEST mode for M2 (dedicated
  NodoDance Stripe account preferred for production launch).
- **Atlas weekly agent:** live, twice-weekly cron (Sun+Wed 06:00 UTC).
  Last run: 478 events auto-published, 717 upcoming, LatAm metros seeded
  (yield still ramping — targeted LatAm crawl push queued).
- Founder confirmed the preview looks great.

## Pending owner actions

1. **Rotate the Neon DB password** (old one was in git history via
   neon-sync.ts) → then update `.env`, GitHub secrets, Vercel env vars.
2. Clean up the dead `nodo-dance` Vercel project.
3. Try the preview on their phone (book the social as a guest with a real
   email to receive the ticket email).

## M1 remainder (optional polish)

- Owner magic-link sign-in flows not browser-exercised (API-verified only).
- "Your reservations" page for signed-in customers (currently only guest
  token pages exist).

## Next: M2 — payments (Stripe Connect test mode)

Order per spec: Stripe Connect "separate charges and transfers" with 0%
application fee → seller onboarding (hosted) → paid drop-in + paid ticket
tiers → expiring inventory holds → tickets issued only after verified
payment → QR + manual door check-in → refunds → signed idempotent webhooks.
Race tests required: last-spot concurrency, double scan, refunded rejection.
Apple Pay/Klarna via Stripe where eligible; PayPal separate multiparty
integration, gated; Plaid deferred unless needed. Report each payment
method as: verified in sandbox / simulated / blocked (with dependency).

Also queued from the security audit: uploads file-type check +
`dangerouslySetInnerHTML` sweep (issues #11/#12); LatAm targeted crawl push.

## How to resume

New message in this chat: **"start M2"** (have Stripe test keys ready —
Secrets: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET; they go into Vercel
preview env + GitHub secrets) — or "continue M1 polish".
