# Admin User Setup Instructions

## Quick Setup (Recommended)

### 1. Start the stack
```bash
docker compose up --build
```

Migrations, RLS, and seed data apply automatically on API boot (`migrate()` in `server/src/db.ts`).

### 2. Create a user and grant platform admin
1. Sign up through the app (or `POST /api/auth/signup`).
2. Grant platform admin via SQL (see also [`../ops.md`](../ops.md)):

```bash
docker compose exec db psql -U postgres postgres -c \
  "UPDATE auth.users SET is_platform_admin = true WHERE email = 'admin@yourleague.com';"
```

3. Sign out and sign back in so the JWT picks up the flag.

### 3. Test Login
1. Visit `/admin`
2. Log in with the credentials you created
3. Verify you can access admin functions (CSV import, finalize scores, etc.)

## Alternative Setup Methods

### Temporary signup for a fresh env
1. Sign up via the app UI
2. Grant `is_platform_admin` with the SQL above
3. Re-login

## Security Best Practices

- Use a strong password for admin accounts
- Keep `JWT_SECRET` and `POSTGRES_PASSWORD` out of source control (see production deploy in [`../ops.md`](../ops.md))
- Prefer granting platform admin only to accounts you control

## Managing Multiple Admins

Grant platform admin the same way for each email:

```sql
UPDATE auth.users SET is_platform_admin = true WHERE email = 'other@example.com';
```

Revoke with `SET is_platform_admin = false`.

## Backup Admin Access

1. Create a second account with a different email
2. Grant `is_platform_admin` the same way
3. Store credentials securely and test login periodically

### Recovery Options
1. **Direct database** — `docker compose exec db psql -U postgres postgres` and update `auth.users`
2. **Password** — update `encrypted_password` only as a last resort (prefer signup + grant on a new account)

## Production Deployment Notes

### Environment Variables
Ensure these are set in production (see [`.env.example`](../../.env.example) and [`../ops.md`](../ops.md)):
```env
VITE_API_URL=/api
JWT_SECRET=...
POSTGRES_PASSWORD=...
```

## Troubleshooting

### Can't Login
1. Confirm the user exists: `SELECT id, email, is_platform_admin FROM auth.users;`
2. Check browser console / network tab for `/api/auth/login` errors
3. Confirm the API is healthy: `GET /api/health`

### Admin Routes Not Working
1. Confirm `is_platform_admin = true` and that you re-logged in after the grant
2. Verify AuthContext / ProtectedRoute wrappers
3. Confirm RLS policies are present (applied via migrations on API boot)

### Database Access Issues
1. Check RLS policies are not too restrictive
2. Verify the request carries a valid JWT
3. Inspect API logs for policy / auth errors

## Testing Checklist

- [ ] User created via signup
- [ ] `is_platform_admin` granted
- [ ] Login works at `/admin` after re-login
- [ ] All admin routes accessible
- [ ] Logout works properly
- [ ] Public routes still work
- [ ] Navigation updates correctly

## Next Steps

1. Test the complete authentication flow ([authentication-testing.md](./authentication-testing.md))
2. Document admin procedures for your league
3. Follow weekly ops in [`../ops.md`](../ops.md)
