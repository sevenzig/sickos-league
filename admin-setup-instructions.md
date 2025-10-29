# Admin User Setup Instructions

## Quick Setup (Recommended)

### 1. Apply Security Policies
```sql
-- Run this in Supabase SQL Editor
-- (Copy from secure-rls-policies.sql)
```

### 2. Create Admin User via Supabase Dashboard
1. **Open Supabase Dashboard** → Your Project
2. **Go to Authentication** → **Users**
3. **Click "Add user"**
4. **Fill in details**:
   - Email: `admin@yourleague.com` (or your preferred email)
   - Password: `securepassword123` (choose a strong password)
   - Email Confirmed: ✅ **Check this box** (important!)
5. **Click "Create user"**

### 3. Test Login
1. **Visit your app** at `/admin`
2. **Login** with the credentials you just created
3. **Verify** you can access all admin functions

## Alternative Setup Methods

### Method 1: Environment Variables for Default Admin
Add to your `.env.local`:
```env
VITE_DEFAULT_ADMIN_EMAIL=admin@yourleague.com
VITE_DEFAULT_ADMIN_PASSWORD=securepassword123
```

Then create a temporary signup component (remove after use).

### Method 2: Temporary Signup Route
1. **Temporarily add** a signup route to App.tsx
2. **Create user** through your app interface
3. **Remove** the signup route
4. **Test** the authentication flow

## Security Best Practices

### Email Configuration (Optional but Recommended)
1. **Configure email templates** in Supabase Auth settings
2. **Set up custom SMTP** or use Supabase's default
3. **Enable email confirmation** for new users

### Password Policies
1. **Set minimum password requirements** in Supabase Auth settings:
   - Minimum 8 characters
   - Require special characters
   - Require numbers

### Additional Security (Advanced)
1. **Enable MFA** (Multi-Factor Authentication)
2. **Set up email change confirmation**
3. **Configure session timeout**
4. **Add IP allowlisting** for admin access

## Managing Multiple Admins (Future)

### Adding Role-Based Access
If you later want multiple admin levels, update AuthContext:

```typescript
// In AuthContext.tsx
const isAdmin = !!user && (
  user.email === 'admin@yourleague.com' ||
  user.user_metadata?.role === 'admin'
);
```

### Setting User Roles
In Supabase Dashboard → Authentication → Users:
1. **Click on a user**
2. **Edit Raw User Meta Data**
3. **Add**: `{"role": "admin"}`

## Backup Admin Access

### Create Backup Admin Account
Always create a backup admin account:
1. **Use different email** (e.g., `backup-admin@yourleague.com`)
2. **Store credentials securely**
3. **Test login periodically**

### Recovery Options
1. **Supabase Dashboard** - Always accessible for user management
2. **Reset Password** - Via email if configured
3. **Direct Database** - Can modify auth.users table if needed

## Production Deployment Notes

### Environment Variables
Ensure these are set in production:
```env
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
```

### Domain Configuration
1. **Add your domain** to Supabase Auth settings
2. **Configure redirect URLs** for auth callbacks
3. **Set up custom email domain** (optional)

## Troubleshooting

### Can't Login
1. **Check user exists** in Supabase Dashboard
2. **Verify email is confirmed**
3. **Check browser console** for errors
4. **Test network connectivity** to Supabase

### Admin Routes Not Working
1. **Verify AuthContext** is providing correct state
2. **Check ProtectedRoute** wrapper
3. **Confirm RLS policies** are applied correctly

### Database Access Issues
1. **Check RLS policies** are not too restrictive
2. **Verify user authentication** state
3. **Monitor Supabase logs** for policy violations

### Password Reset (If Needed)
1. **Via Supabase Dashboard** → Authentication → Users → Reset Password
2. **Via Email** (if email is configured)
3. **Direct database update** (emergency only)

## Testing Checklist

- [ ] Admin user created in Supabase
- [ ] Email marked as confirmed
- [ ] Login works at `/admin`
- [ ] All admin routes accessible
- [ ] Logout works properly
- [ ] RLS policies applied
- [ ] Public routes still work
- [ ] Navigation updates correctly

## Next Steps

1. **Test the complete authentication flow**
2. **Document admin procedures** for your league
3. **Consider adding password reset functionality**
4. **Set up monitoring** for failed login attempts
5. **Plan for user management** as league grows