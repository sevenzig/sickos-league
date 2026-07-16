# Profile System Troubleshooting

## Current Error
```
Error loading profile:
Object { code: "42804", details: "Returned type character varying(255) does not match expected type text in column 2.", hint: null, message: "structure of query does not match function result type" }
```

## Root Cause
The `get_user_profile_with_teams` function expects the `email` column to be `TEXT` but `auth.users.email` is actually `VARCHAR(255)`.

## Fix Options

### Option 1: Run Migration (Recommended)
```bash
# Start Docker Desktop first, then:
npx supabase db reset
# This will apply all migrations including the fix
```

### Option 2: Manual SQL Fix (If Docker unavailable)
Run this SQL directly in Supabase Dashboard > SQL Editor:

```sql
-- Drop and recreate the function with correct return types
DROP FUNCTION IF EXISTS get_user_profile_with_teams(UUID);

CREATE OR REPLACE FUNCTION get_user_profile_with_teams(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    user_id UUID,
    email VARCHAR(255), -- Fixed: Changed from TEXT to VARCHAR(255)
    first_name TEXT,
    last_name TEXT,
    profile_photo_url TEXT,
    email_preferences JSONB,
    fantasy_teams JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(up.user_id, p_user_id) as user_id,
        au.email,
        up.first_name,
        up.last_name,
        up.profile_photo_url,
        COALESCE(up.email_preferences, '{"marketing": false, "league_updates": true, "matchup_reminders": true, "weekly_summaries": false}'::jsonb) as email_preferences,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'league_id', ft.league_id,
                        'league_name', l.name,
                        'team_name', ft.team_name,
                        'team_id', ft.id
                    )
                )
                FROM fantasy_teams ft
                JOIN leagues l ON ft.league_id = l.id
                WHERE ft.manager_user_id = p_user_id
            ),
            '[]'::jsonb
        ) as fantasy_teams,
        COALESCE(up.created_at, NOW()) as created_at,
        COALESCE(up.updated_at, NOW()) as updated_at
    FROM auth.users au
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE au.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_profile_with_teams TO authenticated;
```

### Option 3: Temporary Workaround
If the above doesn't work immediately, you can temporarily modify the frontend to handle the error gracefully by updating the `getUserProfile` method to catch this specific error and create a default profile.

## Verification
After applying the fix, the profile page should load without errors. You can test by:

1. Navigate to `/profile` in the app
2. The page should load with user information
3. Try editing the profile at `/profile/edit`

## Prevention
This type of error is prevented in the future by:
1. Using proper TypeScript types that match database schema
2. Testing migrations thoroughly
3. Using database introspection tools to verify column types

## Related Files
- Database: `supabase/migrations/20241031000002_fix_profile_function.sql`
- Frontend: `src/utils/multiLeagueApi.ts` (UserProfile interface updated)
- Components: `src/pages/UserProfile.tsx`, `src/pages/EditProfile.tsx`