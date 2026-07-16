# 🧹 Migration Cleanup Instructions

## 🚨 **Problem**

You have 20 migration files in your directory, including many old ones with errors. Supabase runs ALL migrations in order, so it's hitting the problematic `20241029000000_convert_to_uuid.sql` first.

## ✅ **Solution: Clean Slate**

### **Step 1: Backup and Remove Old Migrations**

```bash
# Create backup folder
mkdir supabase/migrations/backup

# Move ALL old migrations to backup
mv supabase/migrations/202410290000*.sql supabase/migrations/backup/
mv supabase/migrations/202410290001*.sql supabase/migrations/backup/
```

### **Step 2: Keep Only the Clean Migrations**

Keep only these 3 files in `supabase/migrations/`:

- ✅ `20241029000200_clean_infrastructure.sql`
- ✅ `20241029000201_clean_rls_views.sql`
- ✅ `20241029000202_clean_functions.sql`

### **Step 3: Reset and Deploy Clean**

```bash
# Option A: Reset database (if acceptable)
npx supabase db reset

# Then deploy clean migrations
npx supabase db push

# Option B: If you can't reset, create a fix migration
# (see fix migration below)
```

## 🛠️ **Alternative: Fix Migration**

If you can't reset the database, create this fix migration:

`supabase/migrations/20241029000300_emergency_fix.sql`:

```sql
-- Emergency fix for abbreviation column error
-- Drop the problematic DO block if it exists

-- Ensure teams have UUID column
ALTER TABLE teams ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
UPDATE teams SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

-- Clean up any failed conversion attempts
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS active_qbs_uuid UUID[];

-- Simple helper function without abbreviation reference
CREATE OR REPLACE FUNCTION get_team_uuid_by_name_simple(team_name TEXT)
RETURNS UUID AS $$
DECLARE
    team_uuid UUID;
BEGIN
    SELECT uuid_id INTO team_uuid FROM teams WHERE name = team_name;
    RETURN team_uuid;
END;
$$ LANGUAGE plpgsql;

-- Skip the problematic conversion for now
-- We'll handle data conversion separately with seed data

COMMENT ON FUNCTION get_team_uuid_by_name_simple IS 'Simple team lookup without abbreviation column';
```

## 📋 **Files to Remove/Backup**

Move these problematic files to backup:

- ❌ `20241029000000_convert_to_uuid.sql` (has abbreviation error)
- ❌ `20241029000001_multi_league_schema.sql` (old approach)
- ❌ `20241029000002_multi_league_views.sql` (old approach)
- ❌ `20241029000003_multi_league_rls.sql` (old approach)
- ❌ `20241029000004_league_management_rpcs.sql` (old approach)
- ❌ `20241029000005_invitation_system_rpcs.sql` (old approach)
- ❌ `20241029000006_schedule_generation_rpcs.sql` (old approach)
- ❌ `20241029000007_lineup_week_management_rpcs.sql` (old approach)
- ❌ `20241029000008_dev_seed_data.sql` (old approach)
- ❌ `20241029000009_uuid_verification.sql` (old approach)
- ❌ `20241029000010_proper_multi_league_architecture.sql` (first attempt)
- ❌ `20241029000011_proper_multi_league_rpcs.sql` (first attempt)
- ❌ `20241029000100_infrastructure_uuid_conversion.sql` (second attempt)
- ❌ `20241029000101_multi_league_infrastructure.sql` (second attempt)
- ❌ `20241029000102_rls_and_views.sql` (second attempt)
- ❌ `20241029000103_core_functions.sql` (second attempt)
- ❌ `20241029000104_fix_abbreviation_error.sql` (band-aid fix)

## ✅ **Final Clean State**

After cleanup, you should have only:

```
supabase/migrations/
├── 20241029000200_clean_infrastructure.sql ✅
├── 20241029000201_clean_rls_views.sql ✅
└── 20241029000202_clean_functions.sql ✅

supabase/migrations/backup/
└── [all the old files] 📦
```

## 🚀 **Deploy**

```bash
npx supabase db push
```

## 🔍 **Verify**

```sql
SELECT * FROM v_clean_infrastructure_status;
```

---

**The key issue**: Supabase was trying to run 20 different migration files, many with conflicting logic and errors. The solution is to have only the 3 clean migrations that represent your final architecture.