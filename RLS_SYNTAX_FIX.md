# ✅ RLS Policy Syntax Fix Complete

## 🐛 **Issue Fixed**

PostgreSQL doesn't support multiple operations in a single RLS policy `FOR` clause:

```sql
-- ❌ Invalid syntax
CREATE POLICY fantasy_lineups_edit ON fantasy_lineups
    FOR INSERT, UPDATE, DELETE USING (...);
```

## ✅ **Solution Applied**

Split into separate policies for each operation:

```sql
-- ✅ Correct PostgreSQL RLS syntax
CREATE POLICY fantasy_lineups_insert ON fantasy_lineups
    FOR INSERT WITH CHECK (...);

CREATE POLICY fantasy_lineups_update ON fantasy_lineups
    FOR UPDATE USING (...);

CREATE POLICY fantasy_lineups_delete ON fantasy_lineups
    FOR DELETE USING (...);
```

## 🔧 **Key Changes**

- **Split single policy into 3 separate policies**
- **Used `WITH CHECK` for INSERT** (proper RLS syntax)
- **Used `USING` for UPDATE and DELETE**
- **Updated DROP statements** to match new policy names

## 🚀 **Ready to Deploy Again**

The migration file has been fixed. Try deploying again:

```bash
npx supabase db push
```

## 📋 **What These Policies Do**

### **fantasy_lineups_view** (SELECT)
- Users can see lineups in leagues they're members of

### **fantasy_lineups_insert** (INSERT)
- Users can create lineups for their own teams
- League owners can create lineups for any team in their league

### **fantasy_lineups_update** (UPDATE)
- Users can modify lineups for their own teams
- League owners can modify any lineup in their league

### **fantasy_lineups_delete** (DELETE)
- Users can delete lineups for their own teams
- League owners can delete any lineup in their league

---

**🎯 Status**: ✅ **RLS Syntax Error Fixed**
**🚀 Deploy**: ✅ **Ready for `npx supabase db push`**