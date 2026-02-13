# Nodo Dance - Charlotte's Partner Dance Hub

A production-quality MVP web app connecting partner dance instructors with students and showcasing dance events in Charlotte, NC.

## Features

### For Students
- **Instructor Directory**: Browse and filter dance instructors by style, price, location, and lesson type
- **Event Calendar**: Discover upcoming dance socials, workshops, and festivals
- **Lesson Requests**: Contact instructors directly through the platform
- **Calendar Integration**: Download .ics files to add events to your calendar
- **PWA Support**: Install as an app on mobile devices

### For Instructors
- **Free Profile Creation**: Create a detailed instructor profile with styles, pricing, and availability
- **Lesson Request Management**: Receive and manage lesson requests through your dashboard
- **Payment Links**: Display Venmo, CashApp, PayPal, or cash payment options
- **No Platform Fees**: Keep 100% of your earnings

### For Event Organizers
- **Free Event Submission**: Submit dance events for community visibility
- **Event Moderation**: Admin approval system to maintain quality

### For Admins
- **Event Approval**: Review and approve submitted events
- **Content Moderation**: Remove spam or inappropriate content
- **Analytics**: View instructor and event counts

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: TailwindCSS with custom design system
- **Database**: Prisma ORM with SQLite (dev) / PostgreSQL (production)
- **Authentication**: NextAuth.js with magic link email authentication
- **Email**: Nodemailer for transactional emails
- **Forms**: React Hook Form + Zod validation
- **PWA**: next-pwa for Progressive Web App capabilities
- **Rate Limiting**: LRU cache + Prisma-based fallback

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd nodo-dance
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure the following:

   ```env
   # Database
   DATABASE_URL="file:./dev.db"

   # NextAuth
   NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"
   NEXTAUTH_URL="http://localhost:3000"

   # Email (SMTP) - Example with Gmail
   EMAIL_SERVER_HOST="smtp.gmail.com"
   EMAIL_SERVER_PORT="587"
   EMAIL_SERVER_USER="your-email@gmail.com"
   EMAIL_SERVER_PASSWORD="your-app-password"
   EMAIL_FROM="Nodo Dance <noreply@nododance.com>"

   # Admin Access
   ADMIN_EMAILS="admin@example.com"
   # OR use a simple password (for MVP):
   # ADMIN_PASSWORD="your-admin-password"

   # App Config
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   NEXT_PUBLIC_CITY="Charlotte, NC"
   ```

   **Email Setup Notes**:
   - For Gmail: Enable 2FA and create an [App Password](https://support.google.com/accounts/answer/185833)
   - For other SMTP providers: Use their SMTP credentials
   - For development: Consider using [Ethereal Email](https://ethereal.email/) for testing

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Seed the database with sample data**
   ```bash
   npm run db:seed
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

7. **Open the app**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Database Commands

```bash
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Prisma Studio (database GUI)
npm run db:seed      # Seed database with sample data
```

## Sample Data

The seed script creates:
- **8 sample instructors** across all dance styles (Salsa, Bachata, Kizomba, Tango, Zouk)
- **10 sample events** including socials, workshops, and a festival
- All events are pre-approved for immediate visibility

Sample instructor emails (for testing auth):
- maria.salsa@example.com
- carlos.bachata@example.com
- sophie.kizomba@example.com
- diego.tango@example.com
- luna.zouk@example.com

## Project Structure

```
nodo-dance/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data script
├── public/
│   ├── manifest.json          # PWA manifest
│   └── *.png                  # App icons (add your own)
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── page.tsx           # Landing page
│   │   ├── instructors/       # Instructor directory & profiles
│   │   ├── events/            # Events listing & details
│   │   ├── dashboard/         # Instructor dashboard
│   │   ├── admin/             # Admin panel
│   │   ├── auth/              # Auth pages
│   │   ├── submit-event/      # Event submission form
│   │   └── api/               # API routes
│   ├── components/            # React components
│   │   ├── ui/                # Base UI components
│   │   ├── layout/            # Layout components
│   │   ├── instructors/       # Instructor-specific components
│   │   ├── events/            # Event-specific components
│   │   └── dashboard/         # Dashboard components
│   └── lib/                   # Utilities
│       ├── prisma.ts          # Prisma client
│       ├── auth.ts            # NextAuth config
│       ├── email.ts           # Email utilities
│       ├── rate-limit.ts      # Rate limiting
│       ├── utils.ts           # Helper functions
│       └── constants.ts       # App constants
└── package.json
```

## Deployment

### Recommended: Vercel + Supabase/Railway PostgreSQL

1. **Deploy to Vercel**
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Set up PostgreSQL**
   - Create a PostgreSQL database on [Supabase](https://supabase.com), [Railway](https://railway.app), or [Neon](https://neon.tech)
   - Copy the connection string

3. **Configure Environment Variables in Vercel**
   - Go to your project settings in Vercel
   - Add all environment variables from `.env`
   - Update `DATABASE_URL` to your PostgreSQL connection string

4. **Push database schema**
   ```bash
   DATABASE_URL="your-postgres-url" npx prisma db push
   DATABASE_URL="your-postgres-url" npx prisma db seed
   ```

5. **Redeploy**
   ```bash
   vercel --prod
   ```

### Environment Variables for Production

Make sure to set these in your deployment platform:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Generate a new secret for production
- `NEXTAUTH_URL` - Your production URL
- `EMAIL_SERVER_*` - Your production SMTP credentials
- `ADMIN_EMAILS` or `ADMIN_PASSWORD`
- `NEXT_PUBLIC_APP_URL` - Your production URL
- `NEXT_PUBLIC_CITY` - Your city name

## Features & Pages

### Public Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Hero, CTAs, how it works |
| Instructors | `/instructors` | Searchable directory with filters |
| Instructor Profile | `/instructors/[slug]` | Profile details, lesson request form |
| Events | `/events` | Event calendar with filters |
| Event Details | `/events/[id]` | Event info, calendar download |
| Submit Event | `/submit-event` | Public event submission form |
| Become Instructor | `/become-an-instructor` | Instructor signup landing page |

### Auth Pages

| Page | Route | Description |
|------|-------|-------------|
| Sign In | `/auth/signin` | Magic link email authentication |
| Verify | `/auth/verify` | Email sent confirmation |
| Error | `/auth/error` | Authentication error page |

### Protected Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | Instructor profile editor & lesson requests |
| Admin | `/admin` | Event approval & content moderation |

## Key Functionalities

### Authentication
- Magic link email authentication (passwordless)
- No sign-up form - just enter email and receive login link
- Session-based authentication with NextAuth

### Instructor Profiles
- Rich profiles with bio, photo, styles, and pricing
- Automatic slug generation from display name
- Public/private toggle (currently always public in MVP)
- Payment method links (no platform payments)

### Lesson Requests
- Students submit requests via modal form
- Email sent to both instructor and student
- Honeypot field for spam prevention
- Rate limiting (5 requests per hour per IP)

### Events
- Admin approval workflow (status: PENDING → APPROVED/REJECTED)
- Calendar download (.ics format)
- Filters by style, type, and date range
- Google Maps integration

### Spam Prevention
- Honeypot fields on public forms
- Rate limiting using LRU cache + database fallback
- Email verification for auth
- Admin moderation for events

### PWA
- Installable on mobile devices
- Offline-ready with service worker (via next-pwa)
- Custom app icon and theme color

## Customization

### Branding

1. **Colors** - Edit `tailwind.config.ts`:
   ```ts
   colors: {
     primary: '#1B1F3B',      // Your primary color
     accent: {
       coral: '#FF6F61',      // Your accent colors
       magenta: '#C2185B',
       orange: '#FF8C42',
     },
   }
   ```

2. **Logo** - Replace placeholder in:
   - Header component (`src/components/layout/header.tsx`)
   - PWA icons (`public/icon-*.png`)
   - Favicon (`public/favicon.ico`)

3. **City** - Update `NEXT_PUBLIC_CITY` environment variable

### Dance Styles

Edit `src/lib/constants.ts`:
```ts
export const DANCE_STYLES = [
  'Salsa',
  'Bachata',
  'Kizomba',
  'Tango',
  'Zouk',
  // Add more styles
] as const
```

## Admin Access

Two methods (choose one):

1. **Email Allowlist** (recommended for production)
   ```env
   ADMIN_EMAILS="admin1@example.com,admin2@example.com"
   ```

2. **Simple Password** (MVP simplicity)
   ```env
   ADMIN_PASSWORD="your-secret-password"
   ```

Visit `/admin` to access the admin panel.

## Troubleshooting

### Database Issues
```bash
# Reset database
rm prisma/dev.db
npm run db:push
npm run db:seed
```

### Email Not Sending
- Check SMTP credentials in `.env`
- For Gmail: Ensure app password is correct
- Test with Ethereal Email for development

### PWA Not Installing
- PWA only works over HTTPS (or localhost)
- Ensure manifest.json is accessible
- Check browser console for errors

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next
npm run build
```

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push schema to database
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed database
```

## Future Enhancements

Potential features to add:
- [ ] Reviews/ratings for instructors
- [ ] Featured instructor listings
- [ ] Instructor availability calendar
- [ ] In-app messaging
- [ ] Payment processing integration
- [ ] Multi-city support with city selector
- [ ] Social media sharing
- [ ] Email notifications for new events
- [ ] Instructor verification badges
- [ ] Analytics dashboard

## Support

For issues or questions:
1. Check this README
2. Review the code comments
3. Open an issue on GitHub

## License

MIT License - feel free to use this project as a template for your own dance community platform!

---

Built with ❤️ for the Charlotte dance community
