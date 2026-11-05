# Social media events — what Nodo should do

**Status:** decided, 2026-11-05
**Why it matters:** most small-town studios have an Instagram account and no
website. Covering a state means covering those studios, and they are only
on social media.

---

## The problem

A dance studio in Wilmington, Marion or Sylva announces its Friday social
one way: a post on Instagram, or an event page on Facebook. It may never
put a calendar on its own website.

There are 397 places with a dance name in North Carolina. 49 have a website
we can read. The rest are on social media, and most of them will never
have a website.

So statewide coverage and reading social media are the same problem. We
cannot cover the long tail without either reading social media or having
humans post on the studio's behalf.

## The options

### 1. Read the links on the studio's own website — do it

Every studio links to its own accounts from its own site. We already fetch
those pages, so the accounts are free.

This is what `atlas/lib/social.ts` does: it finds the Instagram, Facebook,
TikTok, YouTube and X profile links on the page the studio published, and
records them against the source.

It is not scraping a platform. We read a page the studio put on its own
website, exactly as we read the rest of it. We never log in, we never read
anyone's posts, and we never touch a private account.

What it buys us:

- We know where each studio posts, so a human can find the missing event.
- A listing can link back to the post it came from.
- It is the list of studios worth approaching about a direct connection.

**This is built.** `atlas/scripts/capture-social-links.ts` runs it.

### 2. Let people post, and credit where they saw it — do it

A studio, or a dancer who saw a post, submits the event to Nodo. The form
now asks "Where did you see this?" and keeps the link.

This is the flywheel the whole business rests on: Nodo covers a town, a
studio sees its own town listed, and posts its events because Nodo is
where its dancers are. We do not have to have the event before the studio
posts it — the studio posting it *is* the coverage.

**This is built.** The field is on the submission form and stored on the
event.

### 3. Connect studios through the official APIs — do it later

Facebook has a Graph API for pages, and Instagram has an API for business
accounts. A studio connects its own account, grants permission, and we
read its events and captions through Meta's own channel.

This is the legitimate version of "reading social media": the content is
theirs, they gave permission, and it is the sanctioned route.

What it costs: a Meta app, App Review, OAuth, token handling, and two APIs
that change often. Realistically this reaches ten to thirty studios in the
first year — the ones with enough presence to bother connecting.

**Recommendation:** build it once the submission flywheel is working and we
know which studios are actually active. The list from step 1 tells us who
to approach.

### 4. Scrape public Facebook and Instagram pages — do not

Technically possible, and we are not going to do it.

- Both platforms put almost everything behind a login now, so reliable
  scraping needs a logged-in session. That is a terms-of-service breach.
- Their pages change constantly. Anything built against them breaks.
- It carries real legal exposure (the CFAA has been used against scrapers).
- It is against the rules this system was built on: never scrape private
  groups, accounts or non-public content, and never bypass authentication
  or access controls.

If we scrape Facebook and Instagram and get it wrong, the whole platform
is suspect — including the parts that are entirely legitimate. That is a
bad trade for a directory.

---

## What this means in practice

| | Now | Later |
|---|---|---|
| Studios with a website | Read automatically, every night | — |
| Studios on social only | Found by a person who posts it | Ask them to connect; read it automatically |
| Where a listing came from | The studio's website, or the link the poster gave us | Same, plus the connected account |

The long tail is covered by people, and the machine covers everyone who
has a website. That is not a compromise — it is the only version of this
that scales and that we would still want to be running in five years.

## The honest limitation

Between them, these leave a gap: a studio that only posts to Instagram,
has no website, and does not know Nodo exists will not be on Nodo until
somebody tells them or somebody posts for them.

The fix for that is not better scraping. It is being visible enough that
somebody tells them — which is why the city pages exist, and why each one
lists the studios we already know about in that town. A studio that sees
its own name on Wilmington's page has a reason to post its events.
