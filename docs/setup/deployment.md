# Deployment Instructions - Invite System & Team Management

## Overview
This deployment adds:
- ✅ **Fixed Invite System**: Complete database infrastructure for league invitations
- ✅ **Unified Team Management**: Combined team slots and invitation management
- ✅ **Fixed Schedule Generation**: Working schedule creation for leagues
- ✅ **Profile System**: User profiles with photo uploads

## Required Migrations

The following migrations need to be applied to fix the current issues:

1. **User Profiles** (`20241031000001_user_profiles.sql`)
2. **Profile Fix** (`20241031000002_fix_profile_function.sql`)
3. **Schedule Generation** (`20241031000003_schedule_generation.sql`)
4. **Invite System** (`20241031000004_invite_system.sql`)

## Deployment Steps

### 1. Apply All Migrations
```bash
# Ensure Docker Desktop is running
npx supabase db reset
```

This will apply all migrations in order and set up:
- User profiles with photo upload
- Working schedule generation
- Complete invite system
- Unified team management

### 2. Verify Migration Success

**Check in Supabase Dashboard > SQL Editor:**

```sql
-- Verify all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
    'user_profiles',
    'league_invitations'
);

-- Verify functions exist
SELECT proname FROM pg_proc
WHERE proname IN (
    'get_user_profile_with_teams',
    'generate_league_schedule',
    'redeem_invite_code'
);
```

Should return all tables and functions.

## New Features Available After Deployment

### 1. Unified Team Management
- **Location**: League Admin page → Team Management section
- **Features**:
  - Visual slot system (1-8 slots)
  - Generate invites per empty slot
  - Copy invite links with one click
  - Real-time status updates
  - Team and manager info display

### 2. Working Invite System
- **Generate Codes**: League owners can create 8-character invite codes
- **Share Links**: Copy-paste invite links to share
- **Join Flow**: Players enter code → choose team name → join league
- **Validation**: Prevents duplicate teams, expired codes, double-joining

### 3. Schedule Generation
- **Requirements**: Minimum 2 teams (changeable in code)
- **Algorithm**: Round-robin across 18 weeks
- **Access**: League admin → "Generate Schedule" button
- **Output**: Populates weekly matchups in league view

### 4. User Profiles
- **Location**: Header dropdown → "My Profile"
- **Features**: Photo upload, personal info, fantasy team management
- **Edit Mode**: `/profile/edit` for full editing capabilities

## Testing Checklist

### ✅ Invite System Test
1. Create a league (or use existing)
2. Go to league admin page
3. Generate invite for empty slot
4. Copy invite link
5. Open in incognito/different browser
6. Sign in as different user
7. Paste invite link and complete flow
8. Verify successful join and team appearance

### ✅ Schedule Generation Test
1. Ensure league has 2+ teams
2. Go to league admin
3. Click "Generate Schedule"
4. Verify success message
5. Go to main league view
6. Navigate through weeks to see matchups

### ✅ Profile System Test
1. Go to header → "My Profile"
2. Click "Edit Profile"
3. Upload photo, edit info
4. Save changes
5. Verify updates appear

## Architecture Changes

### Database Schema Additions
```sql
-- New tables
user_profiles          -- User profile info and preferences
league_invitations     -- Invite codes and redemption tracking

-- New functions
get_user_profile_with_teams()     -- Profile with fantasy teams
generate_league_schedule()        -- Create league matchups
redeem_invite_code()             -- Join league via invite
```

### Frontend Components
```
components/league/TeamManagement.tsx     -- Unified slot/invite management
pages/UserProfile.tsx                   -- Profile view page
pages/EditProfile.tsx                   -- Profile editing
components/profile/ProfilePhotoUpload   -- Photo upload component
```

### API Additions
```typescript
// Working invite methods
MultiLeagueApi.generateInviteCode(leagueId)
MultiLeagueApi.validateInviteCode(code)
MultiLeagueApi.redeemInviteCode(code, teamName)

// Working profile methods
MultiLeagueApi.getUserProfile()
MultiLeagueApi.updateUserProfile()
MultiLeagueApi.uploadProfilePhoto()

// Working schedule method
MultiLeagueApi.generateSchedule(leagueId)
```

## Rollback Plan

If issues occur, you can rollback by:

1. **Database**: Restore from backup before migration
2. **Code**: Revert to previous components:
   - Use `InviteManager` + `TeamSlots` instead of `TeamManagement`
   - Remove profile routes from App.tsx
   - Remove schedule generation if needed

## Monitoring

After deployment, monitor:
- Invite code generation and redemption success rates
- Schedule generation completion
- Profile photo upload success
- Database performance with new tables

## Performance Notes

- All new tables have proper indexes
- RLS policies prevent unauthorized access
- File uploads limited to 1MB for performance
- Invite codes expire automatically (30 days)

## Support

Common issues and solutions documented in:
- [`../troubleshooting/invite-system.md`](../troubleshooting/invite-system.md)
- [`../troubleshooting/schedule-generation.md`](../troubleshooting/schedule-generation.md)
- [`../troubleshooting/profile-system.md`](../troubleshooting/profile-system.md)

The system is now ready for full multi-league operation with working invites and team management!