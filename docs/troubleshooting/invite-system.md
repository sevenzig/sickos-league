# Invite System Troubleshooting Guide

## Current Status: ✅ FIXED

The invite system was broken due to missing database infrastructure. This has been resolved with migration `20241031000004_invite_system.sql`.

## What Was Missing

### Database Tables
- ❌ `league_invitations` table was missing
- ❌ `redeem_invite_code` function was missing
- ❌ Proper RLS policies for invitations

### What Was Added
- ✅ Complete `league_invitations` table with proper schema
- ✅ `redeem_invite_code` function with validation and error handling
- ✅ Row Level Security policies for invitation access
- ✅ Audit logging for invitation usage
- ✅ Automatic cleanup for expired invitations

## How to Apply the Fix

### 1. Apply Database Migration
```bash
# Start Docker Desktop, then:
docker compose up --build
# API migrate() applies all migrations including the invite system
# Full wipe: docker compose down -v && docker compose up --build
```

### 2. Verify Migration Applied
```bash
docker compose exec db psql -U postgres postgres
```

```sql
-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'league_invitations'
);

-- Check if function exists
SELECT EXISTS (
    SELECT FROM pg_proc
    WHERE proname = 'redeem_invite_code'
);
```

## How to Use the Invite System

### For League Owners (Creating Invites)

1. **Navigate to League Admin**
   - Go to your league: `/leagues/{league-id}`
   - Click "Admin" in the header (owners only)

2. **Generate Invite Codes**
   - Scroll to "Invitation Management" section
   - Click "Generate Code" button
   - Code appears in the "Active Codes" section

3. **Share Invite Links**
   - Click "Copy Link" next to any active code
   - Share the copied link with friends
   - Link format: `{your-domain}/invite/{CODE}`

### For Players (Joining Leagues)

1. **Use Invite Link**
   - Click the link shared by league owner
   - Or go to `/invite` and enter the 8-character code manually

2. **Sign In** (if not already signed in)
   - Uses existing auth system

3. **Choose Team Name**
   - Enter a unique team name (3+ characters)
   - Submit to join the league

4. **Access League**
   - Automatically redirected to league dashboard
   - Can now set lineups and participate

## Invite System Features

### Security & Validation
- ✅ **One-time use**: Each code can only be used once
- ✅ **Expiration**: Codes expire after 30 days
- ✅ **Unique team names**: Prevents duplicate team names in league
- ✅ **Member checking**: Prevents users from joining same league twice
- ✅ **Owner-only creation**: Only league owners can generate codes

### User Experience
- ✅ **Two-step process**: Code validation → Team name entry
- ✅ **Real-time validation**: Immediate feedback on invalid codes
- ✅ **Error handling**: Clear error messages for all failure cases
- ✅ **Mobile-friendly**: Works on all devices
- ✅ **Copy to clipboard**: Easy sharing of invite links

### Database Features
- ✅ **Audit trail**: All joins logged in audit_logs table
- ✅ **Cleanup function**: `cleanup_expired_invitations()` for maintenance
- ✅ **Row Level Security**: Proper access controls
- ✅ **Foreign key constraints**: Data integrity maintained

## Testing the Invite System

### End-to-End Test
1. **Create a league** (if you don't have one)
2. **Generate invite code** in league admin
3. **Copy invite link** from the admin panel
4. **Open incognito/private browser** window
5. **Sign in as different user** (or create new account)
6. **Paste invite link** and follow the flow
7. **Verify successful join** - should redirect to league dashboard

### Troubleshooting Common Issues

#### "Function does not exist" Error
**Cause**: Migration not applied
**Solution**: `docker compose down -v && docker compose up --build` to re-apply migrations

#### "Invalid or expired invite code"
**Causes**:
- Code was typed incorrectly
- Code has expired (30+ days old)
- Code was already used
**Solution**: Generate a new code

#### "Team name already exists"
**Cause**: Another user already chose that team name
**Solution**: Choose a different team name

#### "You are already a member"
**Cause**: User already joined this league
**Solution**: Go directly to league dashboard

#### Invite button not showing
**Cause**: User is not the league owner
**Solution**: Only league owners can generate invites

## Database Schema

### league_invitations Table
```sql
CREATE TABLE league_invitations (
    id UUID PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,          -- 8-character code
    league_id UUID REFERENCES leagues(id),
    created_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL,    -- 30 days from creation
    is_active BOOLEAN DEFAULT TRUE,     -- Can be deactivated
    used_at TIMESTAMPTZ,               -- When redeemed
    used_by_user_id UUID,              -- Who redeemed it
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Methods
```typescript
// Generate new invite code
MultiLeagueApi.generateInviteCode(leagueId: string): Promise<string>

// Get all invitations for a league
MultiLeagueApi.getLeagueInvitations(leagueId: string): Promise<Invitation[]>

// Validate an invite code
MultiLeagueApi.validateInviteCode(code: string): Promise<Invitation | null>

// Redeem code and join league
MultiLeagueApi.redeemInviteCode(code: string, teamName: string): Promise<string>
```

## Monitoring & Maintenance

### Check Active Invitations
```sql
SELECT
    l.name as league_name,
    li.code,
    li.created_at,
    li.expires_at,
    li.is_active,
    li.used_at
FROM league_invitations li
JOIN leagues l ON li.league_id = l.id
WHERE li.is_active = true
ORDER BY li.created_at DESC;
```

### Clean Up Expired Invitations
```sql
SELECT cleanup_expired_invitations();
```

### View Usage Stats
```sql
SELECT
    l.name as league_name,
    COUNT(*) as total_invites,
    COUNT(li.used_at) as used_invites,
    COUNT(*) - COUNT(li.used_at) as unused_invites
FROM leagues l
LEFT JOIN league_invitations li ON l.id = li.league_id
GROUP BY l.id, l.name
ORDER BY total_invites DESC;
```

The invite system is now fully functional and ready for use!