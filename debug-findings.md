## Meta
date: 2026-07-28
spec-ref: repair-spec.md 2026-07-28
map-ref: codebase-map.md 2026-07-28

## Observed Error / Symptom
League members could not open another fantasy team's season roster from StandingsTable or SeasonWLTChart. Team identity cells were display-only.

## Intended Behavior
Activating a team's identity in StandingsTable or SeasonWLTChart opens a roster view of that team's owned NFL teams (via existing `get_team_roster`). Week W/L cells continue to open matchup detail.

## Actual Behavior
StandingsTable and SeasonWLTChart rendered team names with no click handler for roster. Roster RPCs and member RLS already existed but were only consumed by LeagueLineups (own roster) and CommissionerLineups (admin).

## Root Cause
Feature gap / not implemented. Backend read path existed; player-facing standings/WLT UI did not wire it. Confidence: high.

## Blast Radius
- `src/components/league/FantasyTeamRosterModal.tsx` (new)
- `src/components/league/StandingsTable.tsx` (LeagueView + LeagueStandingsPage)
- `src/components/tables/SeasonWLTChart.tsx`
- `src/pages/LeagueView.tsx` (teamIdByName bridge)
- Existing: `MultiLeagueApi.getTeamRoster`, MatchupModal / openWLTModal week-cell path (must not regress)
