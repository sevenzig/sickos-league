BQBL Multi-League Rollout: Next Steps Documentation

  🎯 Overview

  This document outlines the step-by-step process for deploying and rolling out the BQBL Multi-League system. The implementation is
  designed for a safe, parallel rollout that preserves the existing single-league functionality while introducing new multi-league
  capabilities.

  📋 Prerequisites

  Before beginning the rollout, ensure you have:

  - Access to production Supabase project dashboard
  - Admin access to the production application
  - Access to the codebase repository
  - Understanding of current user base and league structure

  🚀 Phase 1: Infrastructure Deployment

  Step 1.1: Deploy Database Migrations

  Timeline: 30 minutesRisk Level: Low (additive only)

  1. Connect to Production Supabase
  npx supabase link --project-ref YOUR_PROD_PROJECT_REF
  2. Review Migrations
    - Verify all migration files in supabase/migrations/
    - Confirm they are additive only (no existing table modifications)
  3. Deploy Migrations
  npx supabase db push
  4. Verify Deployment
    - Check Supabase dashboard for new tables
    - Verify RLS policies are active
    - Test RPC functions in SQL editor

  Step 1.2: Deploy Application Code

  Timeline: 15 minutesRisk Level: Low (feature flagged)

  1. Deploy with Feature Flag Disabled
  # Ensure VITE_ENABLE_MULTI_LEAGUE=false in production
  npm run build
  npm run deploy  # or your deployment process
  2. Verify Deployment
    - Confirm existing application functions normally
    - Check that no multi-league UI elements appear
    - Test all existing functionality

  🧪 Phase 2: Development Environment Setup

  Step 2.1: Create Development League

  Timeline: 45 minutesRisk Level: None (dev only)

  1. Set Up Development Environment
  # In .env.development.local
  VITE_ENABLE_MULTI_LEAGUE=true
  VITE_DEV_SUPABASE_URL=your_dev_supabase_url
  VITE_DEV_SUPABASE_ANON_KEY=your_dev_anon_key
  2. Run Development Seed Migration
    - The seed migration will automatically create test data
    - Verify test league appears in development
  3. Test Core Functionality
    - League creation
    - Invitation generation and redemption
    - Team slot management
    - Schedule generation
    - Basic navigation

  Step 2.2: Comprehensive Testing

  Timeline: 2-3 hoursRisk Level: None (dev only)

  1. Test User Flows
    - Owner creates league
    - Owner sends invitations
    - Manager redeems invitation
    - Owner generates schedule
    - All 8 slots filled scenario
  2. Test Edge Cases
    - Expired invitations
    - Invalid invitation codes
    - Duplicate team assignments
    - Permission boundaries
  3. Test Integration Points
    - Authentication flow
    - Navigation between old/new systems
    - Feature flag toggling

  📦 Phase 3: Production League Setup

  Step 3.1: Create First Production League

  Timeline: 1 hourRisk Level: Medium (data creation)

  1. Enable Feature Flag Temporarily
  # Set in production environment
  VITE_ENABLE_MULTI_LEAGUE=true
  2. Create Primary League
    - Sign in as admin user
    - Navigate to /leagues/new
    - Create "BQBL 2025 Season" league
    - Document the league ID
  3. Map Existing Teams to League
  -- Run in Supabase SQL editor
  -- Replace LEAGUE_ID with actual league ID

  INSERT INTO league_teams (league_id, slot_id, team_id)
  SELECT
    'LEAGUE_ID',
    ts.id,
    t.id
  FROM team_slots ts
  JOIN teams t ON ts.slot_number = (
    SELECT ROW_NUMBER() OVER (ORDER BY t.name)
    FROM teams t2 WHERE t2.id = t.id
  )
  WHERE ts.league_id = 'LEAGUE_ID'
  AND ts.slot_number <= 8
  ORDER BY ts.slot_number;

  Step 3.2: Generate Production Schedule

  Timeline: 15 minutesRisk Level: Low

  1. Verify Team Mapping
    - Check that all 8 slots have teams assigned
    - Verify team names and assignments are correct
  2. Generate Schedule
    - Use league dashboard "Generate Schedule" button
    - Verify matchups look correct
    - Compare with existing schedule if needed

  👥 Phase 4: User Migration

  Step 4.1: Identify Current Users

  Timeline: 30 minutesRisk Level: None

  1. Export Current User List
  SELECT email, id, created_at
  FROM auth.users
  ORDER BY created_at;
  2. Categorize Users
    - Admin users (league management)
    - Regular users (team managers)
    - Inactive users

  Step 4.2: Create User Invitations

  Timeline: 1 hour per 8 usersRisk Level: Low

  1. Generate Slot Invitations
    - For each active user, create invitation to appropriate slot
    - Map users to their historical teams
    - Set reasonable expiration times (7 days)
  2. Distribute Invitations
    - Send invitation links via email
    - Include migration explanation
    - Provide support contact information

  Step 4.3: Monitor User Adoption

  Timeline: Ongoing for 1-2 weeksRisk Level: Low

  1. Track Redemption Rate
  SELECT
    COUNT(*) as total_invites,
    COUNT(redeemed_at) as redeemed_invites,
    (COUNT(redeemed_at)::float / COUNT(*) * 100) as redemption_rate
  FROM invitations
  WHERE league_id = 'YOUR_LEAGUE_ID';
  2. Follow Up Actions
    - Send reminder emails for unredeemed invites
    - Provide technical support as needed
    - Extend expiration dates if necessary

  🔄 Phase 5: Full System Cutover

  Step 5.1: Data Validation

  Timeline: 2 hoursRisk Level: Medium

  1. Verify Data Integrity
  -- Check all teams are mapped
  SELECT t.name, lt.league_id IS NOT NULL as mapped
  FROM teams t
  LEFT JOIN league_teams lt ON t.id = lt.team_id;

  -- Check all users are members
  SELECT u.email, lm.league_id IS NOT NULL as is_member
  FROM auth.users u
  LEFT JOIN league_members lm ON u.id = lm.user_id;

  -- Verify schedule completeness
  SELECT week, COUNT(*) as matchup_count
  FROM matchups m
  JOIN league_teams lt1 ON m.team1_id = lt1.team_id
  WHERE lt1.league_id = 'YOUR_LEAGUE_ID'
  GROUP BY week
  ORDER BY week;
  2. Test Critical Paths
    - User can view their leagues
    - Schedule displays correctly
    - Standings calculate properly
    - Lineup management works

  Step 5.2: Communication Plan

  Timeline: 1 week before cutoverRisk Level: Low

  1. User Notification
    - Email announcement of new features
    - Documentation of changes
    - Timeline for full rollout
  2. Support Preparation
    - Update help documentation
    - Prepare FAQ for common issues
    - Train support staff on new features

  Step 5.3: Permanent Feature Flag Activation

  Timeline: 15 minutesRisk Level: Medium

  1. Final Testing
    - Verify all users have been migrated
    - Test core functionality one final time
    - Confirm backup procedures
  2. Enable Feature Flag
  # In production environment
  VITE_ENABLE_MULTI_LEAGUE=true
  3. Monitor System Health
    - Watch error rates
    - Monitor performance metrics
    - Track user engagement

  🛡️ Phase 6: Legacy System Maintenance

  Step 6.1: Legacy Route Preservation

  Timeline: OngoingRisk Level: Low

  1. Maintain Backward Compatibility
    - Keep /admin routes functional
    - Preserve existing CSV import functionality
    - Maintain current scoring calculations
  2. Update Documentation
    - Mark legacy features clearly
    - Document migration paths
    - Plan deprecation timeline

  Step 6.2: Gradual Feature Parity

  Timeline: 2-4 weeksRisk Level: Low

  1. Implement Missing Features
    - League-specific lineup management
    - League-specific standings
    - League-specific schedule views
    - Advanced admin features
  2. Enhance User Experience
    - Mobile responsiveness improvements
    - Performance optimizations
    - Additional audit logging

  🚨 Rollback Procedures

  Emergency Rollback

  If critical issues arise during rollout:

  1. Immediate Actions
  # Disable feature flag
  VITE_ENABLE_MULTI_LEAGUE=false
  # Redeploy application
  2. Data Preservation
    - Multi-league data remains in database
    - Can re-enable flag once issues resolved
    - No data loss in rollback scenario

  Partial Rollback

  For user-specific issues:

  1. Individual User Support
    - Temporarily revoke league membership
    - Grant admin access to legacy system
    - Provide manual workarounds

  📊 Success Metrics

  Technical Metrics

  - Zero downtime during deployment
  - <1% error rate increase
  - Page load times remain stable
  - Database performance maintained

  User Adoption Metrics

  90% invitation redemption rate
  - <5% support tickets related to migration
  - User engagement maintains or improves
  - No regression in daily active users

  Business Metrics

  - All existing functionality preserved
  - New league creation capability functional
  - Admin workflows maintained
  - Data integrity 100% preserved

  📞 Support Contacts

  - Technical Issues: [Your Dev Team Contact]
  - User Support: [Your Support Team Contact]
  - Emergency Escalation: [Your Emergency Contact]

  📚 Additional Resources

  - [Multi-League User Guide] (to be created)
  - [Admin Migration Documentation] (to be created)
  - [Technical Architecture Document] (this implementation)
  - [Feature Flag Management Guide] (to be created)

  ---
  Last Updated: October 29, 2024Version: 1.0Next Review: After Phase 3 completion