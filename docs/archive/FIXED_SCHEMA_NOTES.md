# Schema Fix Applied

## Issue
The original multi-league schema used `UUID` for `team_id` references, but the existing `teams` table uses `INTEGER` primary keys.

## Fix Applied
Changed the following fields from `UUID` to `INTEGER`:

1. **league_teams.team_id** - Now `INTEGER` to match `teams.id`
2. **All RPC function parameters** - Updated `team_id` parameters to `INTEGER`
3. **Active QBs arrays** - Changed from `UUID[]` to `INTEGER[]`
4. **TypeScript interfaces** - Updated to use `number` instead of `string` for team IDs

## Files Modified
- `supabase/migrations/20241029000001_multi_league_schema.sql`
- `supabase/migrations/20241029000006_schedule_generation_rpcs.sql`
- `supabase/migrations/20241029000007_lineup_week_management_rpcs.sql`
- `src/utils/multiLeagueApi.ts`

## Migration Ready
The schema is now compatible with the existing `teams` table and ready for deployment.