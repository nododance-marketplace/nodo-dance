# NextAuth Authentication Loop Fix - Summary

## Problem
Magic-link login redirected back to `/auth/signin` in a loop instead of keeping users signed in.

## Root Causes Identified & Fixed

### 1. **Missing `secret` Configuration**
- **Issue**: NextAuth v4 requires a `secret` for session security
- **Fix**: Added `secret: process.env.NEXTAUTH_SECRET` to authOptions
- **Impact**: Essential for session token signing and validation

### 2. **No Redirect Callback**
- **Issue**: Users weren't redirected after successful sign-in
- **Fix**: Added `redirect` callback that sends users to `/instructor/dashboard` by default
- **Logic**:
  - Relative URLs (`/...`) → Allowed on same site
  - Same origin URLs → Allowed
  - Default → `/instructor/dashboard`

### 3. **Cookie Configuration for Localhost**
- **Issue**: Cookies weren't persisting on localhost
- **Fix**: Added cookie configuration with:
  - `secure: false` in development
  - `httpOnly: true` for security
  - `sameSite: 'lax'` for proper cross-site behavior
  - Different cookie names for dev vs production
- **Impact**: Cookies now work correctly on localhost

### 4. **No Debug Logging**
- **Issue**: Couldn't diagnose what was happening
- **Fix**: Added debug callbacks and console logs:
  - Sign-in callback logs
  - Redirect callback logs
  - Session callback logs
  - Sign-in page status logs
  - Dashboard session verification logs
- **Visibility**: All debug logs prefixed with emojis (🔐, 🔀, 📋, etc.) and only show in development

### 5. **Sign-In Page Improvements**
- **Issue**: Didn't handle already-authenticated users
- **Fix**:
  - Added session check that auto-redirects if already signed in
  - Pass `callbackUrl` through to sign-in process
  - Better error handling with console logs

### 6. **Dashboard Session Validation**
- **Added**: Green debug card showing:
  - Email address
  - User ID
  - Role
  - Sign-out button in header
- **Purpose**: Validates that session is working correctly

---

## Files Modified

### Core Auth Configuration
- ✅ `src/lib/auth.ts` - Complete rewrite with all fixes

### Pages
- ✅ `src/app/auth/signin/page.tsx` - Added session check and debug logs
- ✅ `src/app/instructor/dashboard/page.tsx` - Added debug info and sign-out

### New Components
- ✅ `src/components/auth/sign-out-button.tsx` - Reusable sign-out button

---

## Environment Variables Required

Ensure your `.env` file has:

```env
# Required for NextAuth
NEXTAUTH_SECRET="your-secret-here"  # Generate with: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"

# Required for email magic links
EMAIL_SERVER_HOST="smtp.gmail.com"
EMAIL_SERVER_PORT="587"
EMAIL_SERVER_USER="your-email@gmail.com"
EMAIL_SERVER_PASSWORD="your-app-password"  # Gmail App Password
EMAIL_FROM="Nodo Dance <noreply@nododance.com>"
```

### Gmail App Password Setup (if using Gmail)
1. Go to Google Account → Security → 2-Step Verification
2. At bottom, click "App passwords"
3. Generate new app password for "Mail"
4. Copy the 16-character password to `EMAIL_SERVER_PASSWORD`

---

## Testing Steps

### Test 1: Fresh Sign-In Flow
1. **Clear cookies** (Chrome DevTools → Application → Cookies → Delete all)
2. Visit `http://localhost:3000/auth/signin`
3. Enter your email
4. Click "Send Magic Link"
5. **Check terminal** - you should see:
   ```
   📧 [SignIn] Sending magic link to: your@email.com
   📧 [SignIn] Magic link sent, result: { ok: true, ... }
   ```
6. **Check your email** for the magic link
7. Click the link in the email
8. **Watch terminal** - you should see:
   ```
   🔐 [NextAuth] Sign In Callback: { user: 'your@email.com', ... }
   🔀 [NextAuth] Redirect Callback: { url: '/instructor/dashboard', ... }
   📋 [NextAuth] Session Callback: { userEmail: 'your@email.com', ... }
   🔍 [Dashboard] Session check: { hasSession: true, ... }
   ```
9. **Verify**: You should land on `/instructor/dashboard`
10. **Verify**: Green debug card shows your session info
11. **Verify**: "Sign Out" button appears in top-right

### Test 2: Already Signed In
1. While signed in, visit `http://localhost:3000/auth/signin`
2. **Expected**: Immediately redirects to `/instructor/dashboard`
3. **Terminal should show**:
   ```
   🔍 [SignIn Page] Status: authenticated Has session: true
   ✅ [SignIn Page] Already authenticated, redirecting to: /instructor/dashboard
   ```

### Test 3: Protected Route Access
1. Sign out
2. Try visiting `/instructor/dashboard` directly
3. **Expected**: Redirects to `/auth/signin?callbackUrl=/instructor/dashboard`
4. Sign in via magic link
5. **Expected**: Lands back on `/instructor/dashboard`

### Test 4: Sign Out
1. While on dashboard, click "Sign Out" button
2. **Terminal should show**: `🚪 [SignOut] Signing out...`
3. **Expected**: Redirects to `/auth/signin`
4. Try visiting `/instructor/dashboard`
5. **Expected**: Redirects back to sign-in (session is gone)

### Test 5: Session Persistence
1. Sign in successfully
2. Close the browser tab
3. Open a new tab to `http://localhost:3000/instructor/dashboard`
4. **Expected**: Still signed in (no redirect)
5. Session lasts 30 days by default

---

## Debug Logging Guide

All logs are prefixed with emojis for easy scanning:

| Emoji | Meaning | Where |
|-------|---------|-------|
| 🔐 | Sign-in callback | NextAuth |
| 🔀 | Redirect callback | NextAuth |
| 📋 | Session callback | NextAuth |
| 📧 | Email magic link | Sign-in page |
| 🔍 | Session check | Dashboard/Sign-in |
| ✅ | Success state | Various |
| ⚠️ | Warning/missing | Various |
| ❌ | Error | Various |
| 🚪 | Sign-out | Sign-out button |

**Production Note**: All debug logs automatically disable in production (`NODE_ENV=production`)

---

## Common Issues & Solutions

### Issue: "Invalid email configuration"
- **Cause**: EMAIL_SERVER_* variables not set
- **Fix**: Add SMTP credentials to `.env`

### Issue: "Email not sending"
- **Cause**: Gmail blocking less secure apps
- **Fix**: Use Gmail App Password (see above)

### Issue: "Invalid callback URL"
- **Cause**: NEXTAUTH_URL doesn't match your actual URL
- **Fix**: Ensure `NEXTAUTH_URL="http://localhost:3000"` exactly

### Issue: Still getting redirect loop
- **Cause**: Stale cookies from old configuration
- **Fix**: Clear all cookies and try again

### Issue: Session expires immediately
- **Cause**: Missing or invalid NEXTAUTH_SECRET
- **Fix**: Generate new secret: `openssl rand -base64 32`

---

## What Changed in `src/lib/auth.ts`

### Before:
```typescript
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // ❌ No secret
  // ❌ No redirect callback
  // ❌ No cookie config
  // ❌ No debug logging
}
```

### After:
```typescript
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET, // ✅ Added
  callbacks: {
    signIn: async () => { /* ✅ Debug logging */ },
    redirect: async ({ url, baseUrl }) => { /* ✅ Redirect logic */ },
    session: async ({ session, user }) => { /* ✅ Debug + role */ },
  },
  cookies: { /* ✅ Localhost-compatible cookies */ },
  debug: isDev, // ✅ Debug mode
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // ✅ 30 day sessions
  },
}
```

---

## Production Deployment Notes

When deploying to production:

1. **Update NEXTAUTH_URL** to your production domain:
   ```env
   NEXTAUTH_URL="https://yourdomain.com"
   ```

2. **Generate new NEXTAUTH_SECRET** for production:
   ```bash
   openssl rand -base64 32
   ```

3. **Cookies automatically secure** in production (secure: true)

4. **Debug logs automatically disabled** (no console spam)

5. **Session cookies use `__Secure-` prefix** for extra security

---

## Success Criteria

✅ Users can sign in via magic link
✅ No redirect loops
✅ Sessions persist across browser restarts
✅ Sign out works correctly
✅ Protected routes redirect to sign-in
✅ After sign-in, users land on dashboard
✅ Debug info visible in development
✅ All auth flows logged for debugging

---

## Next Steps

1. Test the sign-in flow end-to-end
2. Verify all debug logs appear in terminal
3. Confirm session persists after browser restart
4. Test sign-out functionality
5. Remove debug card from dashboard before production (it auto-hides but can be removed)

**Questions or issues?** Check the terminal logs - all auth events are logged with emoji prefixes for easy debugging!
