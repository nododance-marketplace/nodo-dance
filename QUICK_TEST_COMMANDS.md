# Quick Test Commands

## Run These Commands Now:

```bash
# 1. Restart dev server (to pick up new dependencies)
# Press Ctrl+C to stop, then:
npm run dev

# 2. Test the changes
# Open in browser:
# http://localhost:3000/instructor/dashboard

# 3. If you get TypeScript errors:
npx prisma generate
```

---

## Test Flow (Do This):

### Test 1: Edit Profile
1. Visit: http://localhost:3000/instructor/dashboard
2. Click "Edit Profile"
3. Change your headline
4. Watch for toast: "Saving profile..."
5. Watch for toast: "Profile saved successfully!"
6. Dashboard should show new headline ✅

### Test 2: Upload Photo
1. Go to Edit Profile
2. Click file input
3. Select a photo
4. Watch toast: "Uploading photo..." → "Photo uploaded!"
5. Click "Save Profile"
6. Dashboard shows new photo ✅

### Test 3: Footer Logo
1. Visit any page
2. Scroll to bottom
3. See SVG logo (not "ND" text) ✅

---

## If You Get Errors:

### "Module not found: sonner"
```bash
npm install sonner
npm run dev
```

### "Cannot find module '@/app/instructor/profile/actions'"
- File was created, restart dev server:
```bash
# Ctrl+C then:
npm run dev
```

### Prisma Type Errors
```bash
npx prisma generate
npm run dev
```

### Photo Upload 404
```bash
# Check if folder exists:
ls public/uploads/instructors/

# If missing, create it:
mkdir -p public/uploads/instructors
```

---

## What Changed (Quick Reference):

| Feature | Before | After |
|---------|--------|-------|
| Save button | Always enabled | Disabled when no changes |
| Feedback | Alert boxes | Toast notifications |
| After save | Old data on dashboard | Fresh data immediately |
| Photo upload | No feedback | Toast with progress |
| Footer | "ND" text | SVG logo |
| Navigation | `window.location.href` | `router.push()` + `router.refresh()` |

---

## All Done! 🎉

Your profile editor now:
- ✅ Saves correctly to database
- ✅ Shows toast notifications
- ✅ Refreshes dashboard immediately
- ✅ Uploads photos with feedback
- ✅ Disables save when no changes
- ✅ Shows SVG logo in footer
