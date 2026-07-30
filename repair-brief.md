## Meta
date: 2026-07-28
spec-ref: repair-spec.md 2026-07-28
findings-ref: debug-findings.md 2026-07-28

## Intent
1. Add a read-only FantasyTeamRosterModal that loads `getTeamRoster` for a fantasy_team_id.
2. Make StandingsTable team identity open that modal.
3. Make SeasonWLTChart team column open that modal via name→id map from LeagueView.
4. Leave week-cell matchup clicks unchanged.

## Changes Made
- Created `src/components/league/FantasyTeamRosterModal.tsx` — portal modal; fetches roster; empty/error/loading states; Escape/backdrop close.
- `StandingsTable.tsx` — team cell is a button; opens modal with row `fantasy_team_id`.
- `SeasonWLTChart.tsx` — optional `teamIdByName`; team column button opens modal; week cells still call `openWLTModal`.
- `LeagueView.tsx` — builds `teamIdByName` from `fantasyTeams` and passes it to SeasonWLTChart.

## Preserved
- No migrations, RPC, or allowlist changes.
- `get_team_roster` / `RosterEntry` contracts unchanged.
- Week W/L click → MatchupModal path unchanged.
- Standings stats columns and data loading unchanged.
- RecordTable, lineups privacy, commissioner flows untouched.

## Contract Changes
- `SeasonWLTChartProps.teamIdByName?: Record<string, string>` — additive optional prop; sole call site `LeagueView` updated.

## Regression Check
- StandingsTable on LeagueStandingsPage: gets roster click via shared component (no LeagueView map needed).
- SeasonWLTChart without `teamIdByName`: team column stays non-clickable (safe default).
- Week cells: still `openWLTModal` only.
- Roster vs lineup: modal shows ownership only, not weekly starters.

## Spec Criteria
- StandingsTable activate → roster view: PASS
- SeasonWLTChart team column → roster view: PASS
- Dismiss closes view: PASS
- Empty roster empty state: PASS
- Week cell still matchup: PASS
- RPC error surfaces: PASS

## Drift Detected
- entry points: new UI entry `FantasyTeamRosterModal` (client-only)
- data flows: StandingsTable / SeasonWLTChart → getTeamRoster → roster modal
- contracts: optional `teamIdByName` on SeasonWLTChart
- coupling: StandingsTable + SeasonWLTChart now import FantasyTeamRosterModal; LeagueView supplies name→id map
