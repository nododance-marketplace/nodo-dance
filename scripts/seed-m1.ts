/**
 * M1 seed — three businesses + two offerings, run with:
 *   npx tsx scripts/seed-m1.ts
 *
 * Creates:
 *   - Charlotte Salsa Academy (ACADEMY) with a free weekly beginner salsa
 *     class, capacity 6, 4 of 6 spots booked (2 guest reservations carry
 *     secure token links, printed below).
 *   - Sofia Reyes (TEACHER) — no offerings yet, the empty-dashboard case.
 *   - Charlotte Bachata Socials (ORGANIZER) with a free Friday social,
 *     capacity 30, 25 RSVPs (each with a Ticket; 2 guest tokens printed).
 *
 * Re-runnable: offerings with the fixed slugs are deleted and recreated
 * fresh each run (tickets and tokens included).
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes, randomUUID } from 'crypto'
import { parseAsLocal, addDaysToDateString } from '../src/lib/timezone'

const prisma = new PrismaClient()

const BASE_URL = process.env.SEED_BASE_URL ?? 'http://localhost:3001'

function nextWeekday(weekday: number): string {
  // YYYY-MM-DD of the next given weekday strictly in the future
  const today = new Date()
  const [y, m, d] = today.toLocaleDateString('en-CA').split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const ahead = (weekday - dow + 7) % 7 || 7
  return addDaysToDateString(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ahead)
}

function guestToken(): string {
  return randomBytes(24).toString('hex') // 48 hex chars — matches /t/[token] format
}

function ticketCode(): string {
  return `NODO-${randomBytes(4).toString('hex').toUpperCase()}`
}

const OWNER_USERS = [
  { email: 'maya@charlottesalsa.test', name: 'Maya Torres' },
  { email: 'sofia@sofiareyes.test', name: 'Sofia Reyes' },
  { email: 'andre@bachatasocials.test', name: 'Andre Lim' },
]

async function main() {
  // ── Owners ──────────────────────────────────────────────────────────────
  const owners: Record<string, string> = {}
  for (const u of OWNER_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, role: 'DANCER' },
    })
    owners[u.email] = user.id
  }

  // ── Businesses ──────────────────────────────────────────────────────────
  const businessSpecs = [
    { slug: 'charlotte-salsa-academy', name: 'Charlotte Salsa Academy', kind: 'ACADEMY', owner: 'maya@charlottesalsa.test', city: 'Charlotte', state: 'NC' },
    { slug: 'sofia-reyes', name: 'Sofia Reyes', kind: 'TEACHER', owner: 'sofia@sofiareyes.test', city: 'Charlotte', state: 'NC' },
    { slug: 'charlotte-bachata-socials', name: 'Charlotte Bachata Socials', kind: 'ORGANIZER', owner: 'andre@bachatasocials.test', city: 'Charlotte', state: 'NC' },
  ]
  const businesses: Record<string, string> = {}
  for (const b of businessSpecs) {
    const business = await prisma.business.upsert({
      where: { slug: b.slug },
      update: { name: b.name, kind: b.kind, ownerId: owners[b.owner], city: b.city, state: b.state },
      create: {
        slug: b.slug,
        name: b.name,
        kind: b.kind,
        ownerId: owners[b.owner],
        city: b.city,
        state: b.state,
        members: { create: { userId: owners[b.owner], role: 'OWNER' } },
      },
    })
    businesses[b.slug] = business.id
  }

  // ── Fresh offerings each run ────────────────────────────────────────────
  const CLASS_SLUG = 'beginner-salsa-wednesdays'
  const SOCIAL_SLUG = 'friday-bachata-social'
  const oldIds = (
    await prisma.offering.findMany({
      where: { slug: { in: [CLASS_SLUG, SOCIAL_SLUG] } },
      select: { id: true },
    })
  ).map((o) => o.id)
  if (oldIds.length) {
    await prisma.ticket.deleteMany({ where: { offeringId: { in: oldIds } } })
    await prisma.offering.deleteMany({ where: { id: { in: oldIds } } }) // sessions + reservations cascade
  }

  // ── Free weekly beginner salsa class: capacity 6, 4 booked ─────────────
  const classStart = nextWeekday(3) // Wednesday
  const tz = 'America/New_York'
  const sessions = Array.from({ length: 8 }, (_, i) => {
    const localDate = addDaysToDateString(classStart, i * 7)
    const start = parseAsLocal(localDate, '19:00', tz)
    return {
      startDateTime: start,
      endDateTime: new Date(start.getTime() + 60 * 60 * 1000),
      status: 'SCHEDULED',
    }
  })

  const salsaClass = await prisma.offering.create({
    data: {
      businessId: businesses['charlotte-salsa-academy'],
      type: 'CLASS',
      title: 'Beginner Salsa — Wednesdays',
      slug: CLASS_SLUG,
      styles: JSON.stringify(['Salsa']),
      level: 'Beginner',
      description:
        'Footwork, connection and the basic turn — no experience or partner required. Shoes with a smooth sole help; bring water.',
      venueName: 'Charlotte Salsa Academy — Studio A',
      city: 'Charlotte',
      state: 'NC',
      timeZone: tz,
      price: null, // free in M1 — paid drop-ins arrive in M2
      capacity: 6,
      partnerRequired: true,
      status: 'PUBLISHED',
      isRecurring: true,
      recurrenceGroupId: randomUUID(),
      recurrenceRule: JSON.stringify({ byDay: [3], interval: 1, weeks: 8 }),
      sessions: { create: sessions },
    },
    include: { sessions: true },
  })

  const nextClass = salsaClass.sessions[0]
  const classGuestTokens: string[] = []
  const classGuests = [
    { email: 'dana.pete@example.test', name: 'Dana Pete' },
    { email: 'leo.marin@example.test', name: 'Leo Marin' },
  ]
  for (const g of classGuests) {
    const token = guestToken()
    classGuestTokens.push(token)
    await prisma.reservation.create({
      data: {
        sessionId: nextClass.id,
        offeringId: salsaClass.id,
        guestEmail: g.email,
        guestName: g.name,
        guestToken: token,
        source: 'DROPIN',
        status: 'CONFIRMED',
      },
    })
  }
  // Two more walk-in style bookings without tokens (owner sees them in the dashboard)
  await prisma.reservation.createMany({
    data: [
      { sessionId: nextClass.id, offeringId: salsaClass.id, guestEmail: 'kim.nguyen@example.test', guestName: 'Kim Nguyen', source: 'DROPIN', status: 'CONFIRMED' },
      { sessionId: nextClass.id, offeringId: salsaClass.id, guestEmail: 'ravi.patel@example.test', guestName: 'Ravi Patel', source: 'DROPIN', status: 'CONFIRMED' },
    ],
  })

  // ── Free Friday social: capacity 30, 25 RSVPed, each with a ticket ──────
  const socialStart = nextWeekday(5) // Friday
  const social = await prisma.offering.create({
    data: {
      businessId: businesses['charlotte-bachata-socials'],
      type: 'EVENT',
      title: 'Friday Night Bachata Social',
      slug: SOCIAL_SLUG,
      styles: JSON.stringify(['Bachata', 'Salsa']),
      level: 'All levels',
      description:
        'Doors at 9, DJ Andre on both rooms until midnight. Bachata room and a salsa room upstairs. Free water and plenty of street parking.',
      venueName: 'The Cornwell Ballroom',
      city: 'Charlotte',
      state: 'NC',
      timeZone: tz,
      price: null, // free social — RSVP with instant ticket
      capacity: 30,
      partnerRequired: false,
      status: 'PUBLISHED',
      djCredits: 'DJ Andre Lim',
      sessions: {
        create: {
          startDateTime: parseAsLocal(socialStart, '21:00', tz),
          endDateTime: parseAsLocal(socialStart, '23:30', tz),
          status: 'SCHEDULED',
        },
      },
    },
    include: { sessions: true },
  })

  const socialSession = social.sessions[0]
  const socialGuestTokens: string[] = []
  const rsvpGuests = [
    { email: 'mia.solo@example.test', name: 'Mia Solo' },
    { email: 'jake.ford@example.test', name: 'Jake Ford' },
  ]
  const rsvpWalkIns = Array.from({ length: 23 }, (_, i) => `guest${i + 1}@example.test`)
  const allRsvps = [...rsvpGuests, ...rsvpWalkIns.map((email) => ({ email, name: null }))]
  for (let i = 0; i < allRsvps.length; i++) {
    const r = allRsvps[i]
    const isGuestLink = i < rsvpGuests.length
    const token = isGuestLink ? guestToken() : null
    if (token) socialGuestTokens.push(token)
    await prisma.reservation.create({
      data: {
        sessionId: socialSession.id,
        offeringId: social.id,
        guestEmail: r.email,
        guestName: r.name,
        guestToken: token,
        source: 'DROPIN',
        status: 'CONFIRMED',
      },
    })
    await prisma.ticket.create({
      data: {
        code: ticketCode(),
        offeringId: social.id,
        tierId: null,
        holderEmail: r.email,
        holderName: r.name,
        guestToken: token,
        status: 'ISSUED',
      },
    })
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('Seed complete.')
  console.log('')
  console.log('Businesses:')
  for (const b of businessSpecs) console.log(`  /manage/${b.slug}  (${b.name}, ${b.kind})`)
  console.log('')
  console.log('Offerings:')
  console.log(`  ${BASE_URL}/o/${CLASS_SLUG}   — Beginner Salsa, next session ${nextClass.startDateTime.toISOString()} (4/6 booked)`)
  console.log(`  ${BASE_URL}/o/${SOCIAL_SLUG}   — Friday Bachata Social, ${socialSession.startDateTime.toISOString()} (25/30 RSVPed)`)
  console.log('')
  console.log('Guest ticket links (secure /t/ tokens):')
  console.log(`  class guest 1: ${BASE_URL}/t/${classGuestTokens[0]}  (dana.pete@example.test)`)
  console.log(`  class guest 2: ${BASE_URL}/t/${classGuestTokens[1]}  (leo.marin@example.test)`)
  console.log(`  social guest 1: ${BASE_URL}/t/${socialGuestTokens[0]}  (mia.solo@example.test)`)
  console.log(`  social guest 2: ${BASE_URL}/t/${socialGuestTokens[1]}  (jake.ford@example.test)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
