# Authentication Flow Testing Guide

## Step 1: Apply RLS Policies

1. **Go to your Supabase Dashboard** → SQL Editor
2. **Run the SQL** from `secure-rls-policies.sql`
3. **Verify policies applied** by checking the "Database" → "Policies" section

## Step 2: Create Admin User

### Option A: Through Supabase Dashboard
1. Go to **Authentication** → **Users**
2. Click **"Add user"**
3. Enter email/password (e.g., `admin@yourleague.com` / `securepassword123`)
4. Click **"Create user"**
5. **Important**: Set email as confirmed if you don't have email configured

### Option B: Through Your App (after testing begins)
1. Temporarily add a signup route to your app
2. Create user through the interface
3. Remove signup route after creating admin user

## Step 3: Test the Authentication Flow

### Test 1: Unauthenticated Access
1. **Clear browser storage** (localStorage/sessionStorage)
2. **Visit your app** in incognito/private mode
3. **Verify you can see**:
   - ✅ Home page with matchups/scores
   - ✅ Rosters page
   - ✅ Scores page
   - ✅ Rules page
4. **Verify you CANNOT see**:
   - ❌ "Admin" link in navigation
   - ❌ Any admin routes directly

### Test 2: Admin Route Protection
1. **While unauthenticated**, try visiting:
   - `/admin` - Should show login form
   - `/admin/lineups` - Should show login form
   - `/admin/import` - Should show login form
   - `/admin/migration` - Should show login form

### Test 3: Authentication Process
1. **Visit `/admin`** (should show login form)
2. **Enter wrong credentials** - should show error
3. **Enter correct credentials** - should redirect to admin dashboard
4. **Verify you can see**:
   - ✅ Admin dashboard with navigation cards
   - ✅ "Admin" link now appears in main navigation
   - ✅ Sign out button works

### Test 4: Admin Functionality
1. **Test each admin route**:
   - `/admin` - Dashboard loads
   - `/admin/lineups` - Lineups management loads
   - `/admin/import` - CSV import loads
   - `/admin/migration` - Migration tools load
2. **Test logout** - should return to login form
3. **Test direct URL access** after logout - should require re-authentication

### Test 5: Database Operations
1. **Test data modification** through admin interface:
   - Set lineups
   - Import CSV data
   - Run migrations
2. **Verify operations work** with authenticated user
3. **Check browser console** for any RLS policy violations

## Step 4: Production Testing

### Before Deployment
1. **Set environment variables**:
   ```bash
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

### After Deployment
1. **Test on live site** - repeat all above tests
2. **Check network tab** for any 403 errors (RLS violations)
3. **Monitor Supabase logs** for authentication events

## Common Issues & Solutions

### Issue: Login form shows but auth doesn't work
- **Check**: Supabase URL/keys are correct
- **Check**: Network connectivity to Supabase
- **Check**: Browser console for errors

### Issue: RLS policy violations (403 errors)
- **Check**: Policies are applied correctly
- **Check**: User is actually authenticated
- **Check**: AuthContext is providing correct `isAdmin` value

### Issue: Admin routes accessible without auth
- **Check**: ProtectedRoute is wrapping admin routes
- **Check**: AuthContext is working correctly
- **Check**: Navigation logic shows/hides admin link

### Issue: Navigation doesn't update after login
- **Check**: AuthContext state updates properly
- **Check**: Layout component re-renders on auth state change
- **Check**: `isAdmin` boolean is correct

## Security Verification Checklist

- [ ] Public routes work without authentication
- [ ] Admin routes require authentication
- [ ] Wrong credentials show appropriate errors
- [ ] Logout completely clears session
- [ ] Direct URL access to admin routes redirects to login
- [ ] Database operations respect RLS policies
- [ ] No sensitive data exposed in network requests
- [ ] Admin link only shows for authenticated users
- [ ] Session persists across browser refreshes (until logout)

## Next Steps After Testing

1. **Remove any test/debug code**
2. **Set up email confirmation** (if desired)
3. **Add password reset functionality** (if needed)
4. **Consider adding role-based permissions** for multiple admin levels
5. **Set up monitoring/logging** for authentication events