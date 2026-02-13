# Quick Setup Guide

Follow these steps to get Nodo Dance running locally:

## 1. Install Dependencies
```bash
npm install
```

## 2. Configure Environment Variables

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and update these required fields:

   **Required for local development:**
   ```env
   NEXTAUTH_SECRET="run: openssl rand -base64 32"
   ```

   **Required for email functionality:**
   ```env
   EMAIL_SERVER_USER="your-email@gmail.com"
   EMAIL_SERVER_PASSWORD="your-gmail-app-password"
   ```

   **Optional (use defaults for now):**
   - `DATABASE_URL` - Already set for local SQLite
   - `ADMIN_EMAILS` - Add your email for admin access
   - `NEXT_PUBLIC_CITY` - Change if not Charlotte

### Gmail App Password Setup

1. Go to your Google Account settings
2. Enable 2-Factor Authentication if not already enabled
3. Go to Security → 2-Step Verification → App passwords
4. Generate a new app password for "Mail"
5. Use this 16-character password in `EMAIL_SERVER_PASSWORD`

## 3. Initialize Database
```bash
npm run db:push
npm run db:seed
```

This creates the SQLite database and adds sample data.

## 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 5. Test the App

### Browse Sample Data
- View 8 sample instructors at `/instructors`
- View 10 sample events at `/events`

### Test Authentication
1. Go to `/auth/signin`
2. Enter one of the sample emails (e.g., `maria.salsa@example.com`)
3. Check your terminal - in development, magic link emails are logged to console
4. Copy the sign-in URL from the terminal and visit it
5. You're now signed in! Go to `/dashboard` to edit your profile

### Test Admin Panel
1. Add your email to `ADMIN_EMAILS` in `.env`
2. Sign in with your email
3. Visit `/admin` to approve events and moderate content

## 6. Make it Yours

### Update Branding
1. Replace "ND" logo in `src/components/layout/header.tsx`
2. Add your logo images to `public/` (icon-192.png, icon-512.png, favicon.ico)
3. Update colors in `tailwind.config.ts`

### Change City
Update `NEXT_PUBLIC_CITY` in `.env`:
```env
NEXT_PUBLIC_CITY="Your City, State"
```

## Troubleshooting

### Can't receive magic link emails?
- For development: Check your terminal logs - the sign-in URL is printed there
- Verify your Gmail credentials are correct
- Make sure you're using an App Password, not your regular Gmail password

### Database errors?
```bash
rm prisma/dev.db
npm run db:push
npm run db:seed
```

### Need to reset everything?
```bash
rm -rf node_modules .next prisma/dev.db
npm install
npm run db:push
npm run db:seed
```

## Next Steps

1. **Customize the branding** - Add your logo and colors
2. **Test all features** - Create a profile, submit an event, request a lesson
3. **Deploy to production** - See README.md for deployment instructions
4. **Add real content** - Replace sample data with real instructors and events

Need help? Check the full README.md for detailed documentation.
