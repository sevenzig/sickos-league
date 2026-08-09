# Schedule Generation Troubleshooting

## Current Status
The schedule generation functionality has been implemented with:

### ✅ Database Migration
- Created `20241031000003_schedule_generation.sql`
- Adds `generate_league_schedule(p_league_id UUID)` function
- Adds supporting functions: `get_league_schedule` and `get_league_fantasy_teams`
- Includes proper error handling and security (league owners only)

### ✅ Frontend UI
- Schedule generation button in LeagueAdmin page
- Loading states and error handling
- Success feedback with auto-hide
- Requires all 8 slots to be filled before allowing generation

### ✅ API Integration
- `MultiLeagueApi.generateSchedule()` method calls the database function
- Proper error propagation and logging

## How to Test

### 1. Apply Database Migration
```bash
# Start Docker Desktop, then:
docker compose up --build
# API migrate() applies all migrations including schedule generation
# Full wipe: docker compose down -v && docker compose up --build
```

### 2. Create a Test League
1. Go to `/leagues/new` and create a league
2. Go to the league admin page (`/leagues/{id}/admin`)
3. Add fantasy teams until you have at least 2 (preferably 8 for full testing)

### 3. Generate Schedule
1. Once you have teams, click "Generate Schedule"
2. Should see loading spinner and success message
3. Check browser console for detailed logs

### 4. Verify Schedule
1. Navigate to league view (`/leagues/{id}`)
2. Use week navigation to see different weeks
3. Should see matchups populated

## Common Issues & Solutions

### Issue: "Function does not exist"
**Cause**: Migration hasn't been applied
**Solution**: `docker compose down -v && docker compose up --build` to re-apply migrations

### Issue: "Only league owners can generate schedules"
**Cause**: User is not the league owner
**Solution**: Make sure you're signed in as the user who created the league

### Issue: "Need at least 2 fantasy teams"
**Cause**: Not enough teams in the league
**Solution**: Add more fantasy teams via the admin panel

### Issue: Button is disabled
**Cause**: Not all 8 slots are filled
**Solution**: Either fill all slots or modify the logic to allow generation with fewer teams

### Issue: No matchups showing in league view
**Cause**: Schedule generation might have failed silently
**Solution**: Check browser console and database directly

## Database Verification

### Check if function exists:
```sql
SELECT EXISTS(
    SELECT 1 FROM pg_proc
    WHERE proname = 'generate_league_schedule'
);
```

### Check generated matchups:
```sql
SELECT * FROM league_matchups WHERE league_id = 'your-league-id';
```

### Manual schedule generation:
```sql
SELECT generate_league_schedule('your-league-id'::UUID);
```

## Architecture Notes

### Schedule Algorithm
- **Round-robin**: Each team plays every other team once
- **18-week season**: If not enough unique matchups, cycles repeat
- **Flexible team count**: Works with 2+ teams (optimal: 4-8 teams)

### Database Structure
```
league_matchups
├── id (UUID)
├── league_id (UUID) → leagues.id
├── week (INTEGER 1-18)
├── fantasy_team1_id (UUID) → fantasy_teams.id
└── fantasy_team2_id (UUID) → fantasy_teams.id
```

### Security
- Only league owners can generate schedules
- Clears existing matchups before generating new ones
- Logs all generation actions in audit_logs

## Future Enhancements
- [ ] Allow generation with fewer than 8 teams
- [ ] Playoff bracket generation
- [ ] Schedule templates (division-based, custom)
- [ ] Schedule regeneration with preservation options
- [ ] Bulk schedule operations for multiple leagues