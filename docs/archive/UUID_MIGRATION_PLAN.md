# UUID Migration Plan

## 🎯 Overview

This plan converts the existing BQBL schema from `INTEGER` primary keys to `UUID` primary keys, providing better consistency with the new multi-league system.

## ⚠️ Migration Approach: Dual-Column Strategy

To ensure zero downtime and data safety, we'll use a dual-column approach:

1. **Add UUID columns** alongside existing INTEGER columns
2. **Populate UUID columns** with generated UUIDs
3. **Create mappings** between old and new IDs
4. **Update application** to use UUID columns
5. **Clean up** old columns once migration is complete

## 📋 Step-by-Step Migration

### Phase 1: Database Schema Preparation

**Run Migration:** `20241029000000_convert_to_uuid.sql`

This migration:
- ✅ Adds `uuid_id` columns to all tables
- ✅ Creates UUID foreign key columns
- ✅ Populates mappings between INTEGER and UUID IDs
- ✅ Creates indexes and constraints
- ✅ Converts `active_qbs` arrays to UUID format

### Phase 2: Deploy Multi-League Schema

**Run Migration:** `20241029000001_multi_league_schema.sql` (updated)

This migration:
- ✅ Creates new multi-league tables using UUID references
- ✅ References `teams(uuid_id)` instead of `teams(id)`

### Phase 3: Update Views and Functions

The views need to be updated to use the new UUID columns:

```sql
-- Update league views to use UUID columns
CREATE OR REPLACE VIEW v_league_teams AS
SELECT
    lt.league_id,
    ts.slot_number,
    lt.team_id,
    t.name as team_name,
    t.abbreviation,
    ts.manager_user_id,
    u.email as manager_email
FROM league_teams lt
JOIN team_slots ts ON lt.slot_id = ts.id
JOIN teams t ON lt.team_id = t.uuid_id  -- Use UUID column
LEFT JOIN auth.users u ON ts.manager_user_id = u.id
ORDER BY ts.slot_number;
```

### Phase 4: Application Updates

**Frontend/API Changes Needed:**
- ✅ TypeScript interfaces updated to use `string` for team IDs
- ✅ API functions updated to handle UUID strings
- ⚠️ Need to update lineup handling to use new UUID columns

## 🔧 Current Issues to Resolve

### 1. Lineup Table References

The lineup functions need to be updated to work with both old and new systems:

```sql
-- Need to add this to the conversion migration
ALTER TABLE lineups ADD CONSTRAINT lineups_team_uuid_week_unique
    UNIQUE(team_uuid_id, week);
```

### 2. Matchups Table Updates

The matchups table also needs UUID column updates:

```sql
-- Update matchups to use UUID team references
UPDATE matchups SET
    team1_uuid_id = t1.uuid_id,
    team2_uuid_id = t2.uuid_id
FROM teams t1, teams t2
WHERE matchups.team1_id = t1.id AND matchups.team2_id = t2.id;
```

### 3. View Updates Required

All views need to reference the UUID columns:

```sql
-- v_league_lineups needs to use active_qbs_uuid
-- v_league_matchups needs to use team UUID columns
-- v_league_standings needs to use team UUID columns
```

## 🚀 Deployment Strategy

### Option A: Full UUID Migration (Recommended for New Deployment)

1. **Deploy UUID conversion migration first**
2. **Verify data integrity**
3. **Deploy multi-league schema**
4. **Test all functionality**
5. **Clean up old columns later**

### Option B: Keep INTEGER System (Faster Deployment)

1. **Revert multi-league schema to use INTEGER**
2. **Deploy immediately**
3. **Plan UUID migration for later**

## 🔄 Rollback Plan

If issues arise:

1. **Application rollback**: Switch API to use old INTEGER columns
2. **Database rollback**: Drop new UUID columns if needed
3. **Data safety**: All original data remains intact

## 📊 Verification Steps

After migration:

```sql
-- Verify UUID population
SELECT
    COUNT(*) as total_teams,
    COUNT(uuid_id) as teams_with_uuid
FROM teams;

-- Verify mappings
SELECT
    COUNT(*) as total_lineups,
    COUNT(team_uuid_id) as lineups_with_uuid_teams,
    COUNT(active_qbs_uuid) as lineups_with_uuid_qbs
FROM lineups;

-- Test multi-league functions
SELECT create_league('Test League', 2025, 1);
```

## 🏃‍♂️ Quick Fix Option

If you want to deploy immediately without the full UUID migration, I can quickly revert the multi-league schema to use INTEGER IDs. This would be the fastest path to deployment while preserving the option for UUID migration later.

Would you like me to:
1. **Complete the UUID migration** (more work, but better long-term)
2. **Revert to INTEGER system** (quick deployment, migrate to UUID later)