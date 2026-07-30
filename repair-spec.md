## Meta
created: 2026-07-28
requirement: Any league member can open another fantasy team's season roster (owned NFL teams) by activating that team from StandingsTable or SeasonWLTChart.
source-map: codebase-map.md — 2026-07-28

## Inputs
- fantasy_team_id — UUID — must identify a fantasy team in the current league — missing/invalid: roster fetch fails; UI shows an error or empty state, no crash
- fantasy team name — string — display label for the selected team — missing: do not open roster view
- league membership — auth context — caller must be a league member (enforced by existing `get_team_roster` / `get_league_rosters`) — non-member: RPC error surfaces as failed load
- activate team control — click / Enter / Space on the team identity cell in StandingsTable or SeasonWLTChart — week W/L cells must continue to open matchup detail, not roster

## Outputs
- Roster view UI — modal or equivalent overlay — normal: shows fantasy team name plus that team's rostered NFL teams (name + logo; optional draft pick order) — error: message that roster could not load; empty roster: explicit empty state
- Roster data — `RosterEntry[]` from `get_team_roster` (or filtered `get_league_rosters`) — normal: 0–4 rows with `nfl_team_id`, `nfl_team_name`, `acquired_via`, optional `draft_pick_number` — error: no silent fallback to another team's data
- Close action — dismisses roster view and returns focus to the standings/WLT surface

## Invariants
- `get_team_roster` / `get_league_rosters` contracts and allowlist entries remain unchanged (shared).
- Weekly opponent lineup privacy remains: this feature shows season roster ownership only, never locked-week starter lineups before week lock (implicit contract).
- SeasonWLTChart week-cell click still calls `openWLTModal(teamName, week)` / MatchupModal deep-link behavior (shared MatchupModal pattern).
- Standings W/L/T, PF, %, streak columns and data loading via `v_league_standings` remain unchanged (shared).
- `MultiLeagueApi.getTeamRoster` / `getLeagueRosters` signatures and `RosterEntry` shapes remain unchanged (shared).
- No new RPC, migration, or RLS policy is required; member read already exists (`000012`).
- RecordTable, draft, lineups, scoring, and schedule generation are unchanged.

## Boundaries
- `db/migrations/*` — no schema or RPC changes
- `server/src/rpc.ts` — allowlist already includes roster RPCs; do not change
- Weekly lineup visibility / `get_fantasy_lineups_for_week` — out of scope
- `RecordTable` — not named in the requirement
- Legacy `/rosters` (`Rosters.tsx`) — single-league mock path; out of scope
- `CommissionerLineups.tsx` — already shows rosters for admin lineup edits; do not refactor unless required for shared UI reuse
- Trades / waivers / free agency — out of scope

## Acceptance Criteria
- Given a league member on LeagueView or LeagueStandingsPage, when they activate a team's identity in StandingsTable, then a roster view opens for that team's `fantasy_team_id` showing its owned NFL teams.
- Given a league member on LeagueView, when they activate a team's identity in SeasonWLTChart (team column, not a week W/L cell), then a roster view opens for that fantasy team showing its owned NFL teams.
- Given the roster view is open, when the user dismisses it, then the view closes and standings/WLT remain usable.
- Given a fantasy team with no `fantasy_team_rosters` rows, when its roster is opened, then an empty state is shown (not another team's roster).
- Given the user clicks a W/L/T week cell in SeasonWLTChart, when that action runs, then matchup detail opens as before (roster view does not open).
- Given a non-member or failed RPC, when roster load fails, then the UI shows an error without crashing the page.

## Risks
- `SeasonWLTChart` is name-keyed while roster RPC needs `fantasy_team_id` — wrong name→id mapping would show the wrong roster.
- Click handlers on team cells must not steal week-cell or matchup deep-link behavior.
- Shared `StandingsTable` on LeagueView and LeagueStandingsPage — a broken modal mount on one page could regress the other.
