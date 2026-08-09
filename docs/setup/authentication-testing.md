# Authentication Flow Testing Guide

## Step 1: Start the stack

```bash
docker compose up --build
```

RLS policies and migrations apply on API boot. To inspect policies:

```bash
docker compose exec db psql -U postgres postgres -c \
  "SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LIMIT 20;"
```

## Step 2: Create Admin User

1. Sign up through the app (or `POST /api/auth/signup`)
2. Grant platform admin:

```bash
docker compose exec db psql -U postgres postgres -c \
  "UPDATE auth.users SET is_platform_admin = true WHERE email = 'admin@yourleague.com';"
```

3. Sign out and sign back in so the JWT includes the flag

## Step 3: Test the Authentication Flow

### Test 1: Unauthenticated Access
1. Clear browser storage (localStorage/sessionStorage)
2. Visit your app in incognito/private mode
3. Verify you can see:
   - Home page with matchups/scores
   - Rosters page
   - Scores page
   - Rules page
4. Verify you CANNOT see:
   - "Admin" link in navigation
   - Any admin routes directly

### Test 2: Admin Route Protection
1. While unauthenticated, try visiting:
   - `/admin` - Should show login form
   - `/admin/lineups` - Should show login form
   - `/admin/import` - Should show login form
   - `/admin/migration` - Should show login form

### Test 3: Authentication Process
1. Visit `/admin` (should show login form)
2. Enter wrong credentials - should show error
3. Enter correct credentials - should redirect to admin dashboard
4. Verify you can see:
   - Admin dashboard with navigation cards
   - "Admin" link now appears in main navigation
   - Sign out button works

### Test 4: Admin Functionality
1. Test each admin route:
   - `/admin` - Dashboard loads
   - `/admin/lineups` - Lineups management loads
   - `/admin/import` - CSV import loads
   - `/admin/migration` - Migration tools load
2. Test logout - should return to login form
3. Test direct URL access after logout - should require re-authentication

### Test 5: Database Operations
1. Test data modification through admin interface:
   - Set lineups
   - Import CSV data
2. Verify operations work with authenticated user
3. Check browser console for any RLS / 403 errors

## Step 4: Production Testing

### Before Deployment
1. Set environment variables (see [`.env.example`](../../.env.example)):
   ```bash
   VITE_API_URL=/api
   ```
2. Follow production deploy in [`../ops.md`](../ops.md)

### After Deployment
1. Test on live site - repeat all above tests
2. Check network tab for any 403 errors (RLS violations)
3. Monitor API logs for authentication events

## Common Issues & Solutions

### Issue: Login form shows but auth doesn't work
- Check: `VITE_API_URL` points at the API (`/api` in compose)
- Check: API health (`GET /api/health`)
- Check: Browser console for errors

### Issue: RLS policy violations (403 errors)
- Check: Policies applied via migrations on API boot
- Check: User is actually authenticated (valid JWT)
- Check: AuthContext is providing correct admin state

### Issue: Admin routes accessible without auth
- Check: ProtectedRoute is wrapping admin routes
- Check: AuthContext is working correctly
- Check: Navigation logic shows/hides admin link

### Issue: Navigation doesn't update after login
- Check: AuthContext state updates properly
- Check: Layout component re-renders on auth state change
- Check: platform-admin flag is present after re-login

## Security Verification Checklist

- [ ] Public routes work without authentication
- [ ] Admin routes require authentication
- [ ] Wrong credentials show appropriate errors
- [ ] Logout completely clears session
- [ ] Direct URL access to admin routes redirects to login
- [ ] Database operations respect RLS policies
- [ ] No sensitive data exposed in network requests
- [ ] Admin link only shows for authenticated platform admins
- [ ] Session persists across browser refreshes (until logout)

## Next Steps After Testing

1. Remove any test/debug code
2. Add password reset functionality (if needed)
3. Set up monitoring/logging for authentication events
