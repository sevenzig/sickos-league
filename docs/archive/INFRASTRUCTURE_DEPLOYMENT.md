# 🏗️ Infrastructure-Only Deployment Guide

## 🎯 **Focus: Clean Infrastructure Setup**

This deployment focuses on creating the **infrastructure foundation** for the multi-league system without attempting to migrate existing data. Seed data will be provided separately once the infrastructure is stable.

## 📋 **Migration Files (In Order)**

Execute these migrations in the exact order listed:

### **1. UUID Infrastructure**
- **File**: `20241029000100_infrastructure_uuid_conversion.sql`
- **Purpose**: Adds UUID columns to existing tables without data conversion
- **What it does**:
  - Adds `uuid_id` columns to `teams`, `lineups`, `matchups`
  - Creates UUID foreign key columns
  - Sets up indexes and constraints
  - Creates helper functions for future data migration

### **2. Multi-League Tables**
- **File**: `20241029000101_multi_league_infrastructure.sql`
- **Purpose**: Creates new table structure for proper multi-league support
- **What it does**:
  - Creates `leagues`, `league_members`, `fantasy_teams` tables
  - Creates `league_matchups`, `fantasy_lineups` tables
  - Sets up proper relationships and constraints
  - Creates performance indexes

### **3. Security & Views**
- **File**: `20241029000102_rls_and_views.sql`
- **Purpose**: Implements Row Level Security and useful views
- **What it does**:
  - Enables RLS on all new tables
  - Creates security policies for data access
  - Creates helpful views for common queries
  - Sets up infrastructure monitoring views

### **4. Core Functions**
- **File**: `20241029000103_core_functions.sql`
- **Purpose**: Essential RPC functions for basic operations
- **What it does**:
  - `create_league()` - Create new leagues
  - `create_fantasy_team()` - Add teams to leagues
  - `set_fantasy_lineup()` - Set weekly lineups
  - `get_user_leagues()` - List user's leagues
  - `toggle_week_lock()` - Lock/unlock weeks

## 🚀 **Deployment Steps**

### **Step 1: Connect to Supabase**
```bash
# Connect to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Verify connection
npx supabase status
```

### **Step 2: Deploy Infrastructure Migrations**
```bash
# Deploy all migrations in order
npx supabase db push
```

### **Step 3: Verify Infrastructure**
Run this in your Supabase SQL editor:

```sql
-- Check infrastructure status
SELECT * FROM v_infrastructure_status;

-- Verify UUID infrastructure
SELECT * FROM verify_uuid_infrastructure();

-- Verify multi-league infrastructure
SELECT * FROM verify_multi_league_infrastructure();

-- Test basic functionality
SELECT create_league('Test League', 2025, 1);
```

## ✅ **Expected Results**

After successful deployment, you should see:

### **UUID Infrastructure**
- ✅ `teams.uuid_id` column exists with unique constraint
- ✅ `lineups.team_uuid_id` column exists with foreign key
- ✅ `matchups.team1_uuid_id`, `team2_uuid_id` columns exist
- ✅ Helper functions available for data conversion

### **Multi-League Tables**
- ✅ `leagues` table ready for league creation
- ✅ `fantasy_teams` table ready for team management
- ✅ `league_matchups` table ready for scheduling
- ✅ `fantasy_lineups` table ready for lineup management

### **Security & Views**
- ✅ RLS policies protecting data access
- ✅ Views available for easy data querying
- ✅ Infrastructure monitoring in place

### **Core Functions**
- ✅ League creation working
- ✅ Fantasy team creation working
- ✅ Basic lineup management working
- ✅ Week locking functionality working

## 🔍 **Verification Commands**

Run these to confirm everything is working:

```sql
-- 1. Create a test league
SELECT create_league('Infrastructure Test', 2025, 1) as league_id;

-- 2. Check the league was created
SELECT * FROM leagues WHERE name = 'Infrastructure Test';

-- 3. Create a fantasy team (replace league_id with actual ID)
SELECT create_fantasy_team(
  'your-league-id-here'::UUID,
  'Test Team'
) as team_id;

-- 4. Check fantasy team was created
SELECT * FROM fantasy_teams WHERE team_name = 'Test Team';

-- 5. Check views are working
SELECT * FROM v_user_leagues;
SELECT * FROM v_fantasy_teams;

-- 6. Clean up test data
DELETE FROM fantasy_teams WHERE team_name = 'Test Team';
DELETE FROM leagues WHERE name = 'Infrastructure Test';
```

## 🗃️ **Database Schema Overview**

### **Core Tables Created**
```
leagues
├── league_members (who belongs to which league)
├── fantasy_teams (participants in leagues)
├── league_matchups (fantasy team vs fantasy team)
├── fantasy_lineups (which NFL teams to start)
└── weeks (week settings and locks)
```

### **Legacy Tables Enhanced**
```
teams (existing)
├── + uuid_id column (new UUID primary key)
└── indexes and constraints

lineups (existing)
├── + team_uuid_id column (references teams.uuid_id)
└── + active_qbs_uuid column (for NFL team UUIDs)

matchups (existing)
├── + team1_uuid_id, team2_uuid_id columns
└── + winner_uuid_id column
```

## 🎯 **Key Architecture Benefits**

### **✨ Clean Separation**
- **NFL Teams** (`teams`) - Source of QBs, shared across leagues
- **Fantasy Teams** (`fantasy_teams`) - League participants, scoped to leagues
- **Clear relationships** - No more confusion about team references

### **🔒 Multi-League Ready**
- Fantasy teams scoped to specific leagues
- Proper data isolation between leagues
- Scalable to unlimited leagues

### **🚀 Performance Optimized**
- UUID indexes for fast lookups
- Proper foreign key constraints
- Minimal data duplication

## 🚧 **What's NOT Included**

This infrastructure deployment does **NOT** include:

- ❌ **Data migration** from legacy tables
- ❌ **Seed data** for teams or leagues
- ❌ **Schedule generation** functions
- ❌ **Advanced features** like invitations or standings

These will be added separately once the infrastructure is stable.

## 📞 **Next Steps**

After successful infrastructure deployment:

1. **✅ Verify** all verification commands pass
2. **🌱 Add seed data** for NFL teams with proper UUIDs
3. **🏗️ Create test leagues** and fantasy teams
4. **🧪 Test API functions** from frontend
5. **📈 Monitor performance** and optimize if needed

## 🔧 **Troubleshooting**

### **Migration Fails**
- Check that you're connected to the right project
- Ensure no conflicting table names exist
- Review Supabase logs for specific errors

### **Functions Don't Work**
- Verify user authentication is working
- Check RLS policies are not blocking access
- Confirm foreign key relationships

### **Performance Issues**
- Check that indexes were created successfully
- Monitor query performance in Supabase dashboard
- Optimize views if needed

---

**🎯 Status**: ✅ **Infrastructure Ready**
**🗄️ Database**: ✅ **Clean Architecture**
**🔒 Security**: ✅ **RLS Enabled**
**📱 API**: ✅ **Core Functions Available**

The infrastructure is now ready for seed data and application integration!