# Season year cutover (2025 test → 2026 beta) + future-year archive

**Purpose:** Make the platform **2026-native** for the beta launch. Retire hardcoded `2025` defaults (a testing year). Keep the live beta league and current `game_stats` working through the change. Add thin multi-year plumbing so **2027+** can treat prior seasons as archived without a dump system.
**Prerequisite:** Platform CSV finalize (`20241031000042`); `leagues.season` + `game_stats.season` already exist; weekly CSVs under `scoring/2026/` carry `SeasonID=2026`.
**Date:** 2026-09-29
**Status:** shipped (2026-09-29)

Follow `~/wiki/rules/writing_general.md` and coding behavior (project `.claude/skills`): state assumptions, keep changes surgical, verify before expanding scope.

---

## Positioning (locked)

1. **2025 was testing. 2026 is the beta launch season.** Do not build product UX to browse 2025. Optionally delete leftover 2025 test rows after the live league is confirmed on 2026.
2. **Season id = NFL calendar year** (`2026`, `2027`, …). Already stored on `leagues.season` and `game_stats.season`. No new season table.
3. **One shared `CURRENT_SEASON` constant** (start at `2026`) drives Create League default, Admin Import default, finalize default, and client API defaults. Prefer a module const over `platform_settings` for this pass.
4. **CSV `SeasonID` is source of truth on import.** Refuse or hard-warn if file season ≠ selected admin season. Never stamp `CURRENT_SEASON` while ignoring a `2026` column in the file.
5. **Finalize joins `leagues.season = p_season` and scores from `game_stats.season`.** League row, stats rows, and the season passed to `platform_finalize_week` must match. Mismatch → empty WLT after a “successful” import.
6. **Live-safe order:** ship season-aware code first (still works if data is briefly still labeled 2025, as long as admin passes that year) → short data align window → optional purge of orphan 2025 test data → archive UX for *future* years.
7. **Archive = leave old season leagues in place, filter them out of the default list, soft-lock writes.** Not a separate DB, not CSV export, not cloning last year’s league.
8. **Legacy `/archive` (single-league tables) is out of scope.** Do not confuse it with multi-year season archive.
9. **NFL `matchups.game_time` stays current-calendar-only** (overwrite by week). Pass `--year 2026` in ops. No historical kickoff archive in this pass.
10. **Do not rewrite applied migration files** to erase `2025`. Add a new migration for defaults / RPC `p_season` defaults if needed. Historical SQL and fixture CSVs may still contain `2025`.

---

## Assumptions (surface before coding)

| Assumption | If wrong |
|---|---|
| At least one live beta league exists and must keep managers/rosters/matchups | Prefer `UPDATE leagues SET season = 2026` over recreate |
| Any `game_stats` for weeks already scored for that league may be labeled `2025` | Relabel those weeks to `2026` **or** re-import `scoring/2026/` CSVs + Finalize — pick one after inspect |
| Orphan 2025 leagues / stats are disposable test junk | Safe to delete **after** live rows are on 2026 and smoke-tested |
| No manager needs to browse 2025 in My Leagues | Skip “Past seasons” UI for 2025; still ship season filter plumbing for 2027 |
| Prod and local may differ | Run inspect SQL on **each** environment before mutate |

**Stop and ask** if inspect shows a league mid-playoffs with mixed season labels, or if deleting 2025 would remove the only copy of data the commissioner still wants.

---

## What changes vs today

| Today | After |
|---|---|
| `SEASON = 2025` / `createLeague(..., 2025)` / API defaults `2025` | Shared `CURRENT_SEASON = 2026` |
| Import stamps caller season; ignores CSV `SeasonID` | Parse `SeasonID`; write + finalize that year; mismatch = error |
| `getWeeklyQBPerformancesFromDb(week)` filters week only | Also filter `season` (league season or `CURRENT_SEASON`) |
| Live league may still be `season = 2025` while CSVs are 2026 | Live beta league + its stats on `2026` |
| My Leagues lists all seasons together | Default list = current season; optional “Past seasons” for `season < CURRENT_SEASON` (ship when useful; not required to unblock 2026 ops) |
| Past seasons writable | Soft-lock: no join / lineup / commissioner writes when `league.season < CURRENT_SEASON` (Phase C; can follow Phase A/B) |

---

## Live-safe rollout (do not skip phases)

### Phase 0 — Inspect (read-only; no deploy)

Run on the DB you will change (local and prod separately):

```sql
SELECT id, name, season, draft_status, created_at
FROM leagues
ORDER BY season, created_at;

SELECT season, week, COUNT(*) AS rows
FROM game_stats
GROUP BY season, week
ORDER BY season, week;

-- Optional: which leagues have matchups / scores already
SELECT l.id, l.name, l.season,
       COUNT(lm.*) FILTER (WHERE NOT lm.is_playoff) AS rs_games,
       COUNT(lm.*) FILTER (WHERE lm.is_complete) AS complete
FROM leagues l
LEFT JOIN league_matchups lm ON lm.league_id = l.id
GROUP BY l.id
ORDER BY l.season, l.name;
```

Record:

- **Keep:** league id(s) that are the 2026 beta (even if `season` column still says 2025).
- **Drop later:** pure test leagues / 2025-only `game_stats` with no keep-league.
- **Align path:** `UPDATE` keep-league to 2026 vs recreate (only recreate if commissioner agrees and managers can rejoin).

→ verify: written cutover notes (which ids keep / delete / update). Do not mutate yet.

### Phase A — Code (deployable without data change)

Live service stays up. If data is still labeled 2025, admin can still finalize with season **2025** via override until Phase B.

Work items A1–A5 below.

→ verify: unit/verify scripts; local import of a 2026 CSV with override or after const change; existing leagues still load.

### Phase B — Data align (short window; coordinate)

1. Prefer downtime of **minutes** (avoid overlapping CSV import / finalize).
2. `UPDATE leagues SET season = 2026 WHERE id IN (…) -- keep ids only`.
3. Align stats: either  
   - `UPDATE game_stats SET season = 2026 WHERE season = 2025 AND week IN (… weeks already used by beta …)`, **or**  
   - delete those week rows and re-import from `scoring/2026/` then **Finalize Week** for each.
4. Smoke: League home scores, standings, WLT for current week; Admin history shows season 2026.
5. Ops: kickoff sync `--year 2026`.

→ verify: inspect SQL shows keep-league(s) on 2026; `game_stats` for imported weeks on 2026; finalize with `p_season = 2026` touches those leagues.

### Phase C — Optional purge + archive UX

1. Delete orphan test leagues (cascade members/teams/matchups as schema allows) and leftover `game_stats` where `season = 2025` only after Phase B smoke.
2. My Leagues: default filter `season === CURRENT_SEASON`; “Past seasons” for older (empty until 2027 — fine).
3. Soft-lock writes when `league.season < CURRENT_SEASON` (join, lineup save, schedule edits, join-code generate). Reads stay.

→ verify: no 2025 rows left that you intended to drop; create league defaults to 2026; past-season lock behaves on a fixture league with `season = 2025` in verify only (do not leave that fixture in prod).

### Phase D — Docs / wiki (on ship)

Update `docs/ops.md` (year in weekly loop), wiki `decisions.md` / `apis.md` / project index, mark this brief shipped.

---

## Target user / ops flow (after ship)

1. Commissioner creates a league → season defaults to **2026** (no picker required in this pass unless already present).
2. Wednesday: `sync-nfl-kickoffs-espn.mjs --year 2026 --weeks N,N+1,N+2`.
3. Platform admin uploads `BQBL-2026_WEEK-NN.csv` at `/admin/import`. Parser reads `SeasonID=2026`; import writes `game_stats.season = 2026`; `platform_finalize_week(week, 2026)` locks/scores only 2026 leagues.
4. Managers use lineups / home as today.
5. Next calendar year: bump `CURRENT_SEASON` to 2027; 2026 leagues fall into Past / soft-lock without a data migration.

---

## Code map

| Piece | Location |
|-------|----------|
| Shared const | **New** e.g. `src/utils/currentSeason.ts` (`export const CURRENT_SEASON = 2026`) — also usable from scripts if mirrored or imported |
| Admin Import | `src/pages/AdminImport.tsx` (`const SEASON = 2025`) |
| CSV import + finalize | `src/services/csvImporter.ts` |
| CSV parse | `src/utils/csvParser.ts` (add `SeasonID`; return season) |
| Create League | `src/pages/CreateLeague.tsx` (hardcoded `2025`) |
| API defaults | `src/utils/multiLeagueApi.ts` (`createLeague`, `finalizeWeekScores`, `platformFinalizeWeek`) |
| QB stats reads | `src/services/database.ts` (`getWeeklyQBPerformancesFromDb`); callers in `LeagueView`, `LeagueSchedule`, `EnterScores`, `dbStandingsCalculator` |
| My Leagues | `src/pages/MyLeagues.tsx` |
| RPC defaults (optional migration) | Live `platform_finalize_week` / `finalize_week_scores` / `create_league` — `p_season INTEGER DEFAULT 2025` in recent migrations |
| Verify / ops scripts | `scripts/verify-a3-weekly-ops.mjs`, other `SEASON = 2025` verifies, `docs/ops.md` |
| Scoring files | `scoring/2026/*.csv` (source of truth for beta weeks) |
| Legacy archive (do not touch) | `/archive`, `Home.tsx`, `20241031000020_legacy_archive_readonly.sql` |

---

## Surgical work items

### A1. `CURRENT_SEASON` module

- Add `src/utils/currentSeason.ts` with `CURRENT_SEASON = 2026`.
- Replace hardcoded create/import/finalize/API defaults that mean “platform current year.”
- Leave **verify scripts** on an explicit season they control (prefer importing the const, or set `SEASON = CURRENT_SEASON`, so they track the platform year).
- Do not change every historical comment or bundled fixture CSV in `src/data/*`.

### A2. Admin Import season control

- Default selected season = `CURRENT_SEASON`.
- Allow override (number input or select) for late fixes / Phase B transition.
- Pass that season into `importWeeklyCSV` and manual Finalize.
- Show season on history rows (already have `season` on history items).

### A3. CSV `SeasonID`

- In `parseWeeklyCSV`, read `SeasonID` from each data row (require consistent season across rows).
- Return `{ week, season, qbPerformances }` (or equivalent).
- `importWeeklyCSV`: if parsed season ≠ argument season → fail with a clear error (no partial write).
- Prefer: if admin left default and CSV has SeasonID, use CSV season for write + finalize (document which wins — **locked choice: CSV wins when present and consistent; admin override must match or import aborts**).

### A4. QB performance reads by season

- Change `getWeeklyQBPerformancesFromDb(week, season)` (required season arg, or default `CURRENT_SEASON`).
- Update cache key to include season.
- Callers that have a league context pass `league.season`; platform/admin paths pass selected / current season.
- `dbStandingsCalculator` and live card math must not mix years once both exist.

### A5. DB defaults migration (optional in same PR as A, or with B)

- New migration only: `ALTER TABLE leagues ALTER COLUMN season SET DEFAULT 2026` (and any other table defaults still on 2025 that affect create).
- Recreate or `CREATE OR REPLACE` finalize/import-related functions so `p_season` default is 2026 where the live body still defaults to 2025.
- Do not edit old migration files.

### B. Data cutover (runbook, not app code)

- Follow Phase B; keep SQL in ops notes or a one-shot script under `scripts/` **only if** it is idempotent and dry-run capable. Prefer documented manual SQL for one-time prod.
- Never run purge in the same step as relabel without a successful smoke in between.

### C1. My Leagues filter

- Default: show leagues where `season === CURRENT_SEASON`.
- Control: “Past seasons” toggles `season < CURRENT_SEASON` (or shows a grouped section).
- Keep season badge on cards (already present).

### C2. Soft-lock past seasons

- Client: disable join / lineup edit / admin write entry points when `league.season < CURRENT_SEASON`; show short “Archived season” copy.
- Server: prefer refuse in existing RPCs (join redeem, `set_fantasy_lineup`, schedule setters, join-code generate) when league season &lt; current — **current must be passed or read from a single DB setting**. For this pass, comparing to a SQL constant / migration-bumped helper is acceptable; avoid a half-built `platform_settings` table unless already needed.
- Reads (standings, schedule, lineups view) stay allowed.

### D. Verify

- Extend or add `scripts/verify-season-cutover.mjs` (or fold into `verify-a3-weekly-ops.mjs`):
  - Import sample rows with `SeasonID=2026` → `game_stats.season = 2026`.
  - Mismatched admin season vs CSV → error, no insert.
  - `platform_finalize_week(w, 2026)` only touches leagues with `season = 2026`.
  - QB fetch for week 1 season 2026 does not return 2025 rows when both exist (seed both in test).
- Update `verify-a3-weekly-ops.mjs` off hardcoded 2025 / old CSV path names.
- Smoke checklist for human: create league → season 2026; import week CSV; finalize; LeagueView WLT.

---

## Hard boundaries — must NOT touch

- Legacy `/archive` single-league path and its RLS
- Scoring math / `compute_lineup_score` formula (only season plumbing)
- NFL kickoff schema (no `season` column on `matchups` this pass)
- Cloning a prior-year league into a new season
- Separate archive database or nightly dump-of-season job
- Rewriting applied migrations to remove `2025` strings
- Redesign of Admin Import beyond season selector + clearer errors
- Bundled marketing/demo CSVs in `src/data/*` unless a verify still imports them as “current”

---

## Open before coding (only if blocked)

- **Keep-league still on 2025 with real managers:** Phase B must `UPDATE` that id — do not delete and recreate without asking.
- **Already-imported weeks labeled 2025 that match 2026 CSV content:** prefer `UPDATE game_stats.season` for those weeks over delete+reimport if lineups/finalize already ran; reimport+finalize if scores look wrong after relabel.
- **Soft-lock “current” on the server:** if comparing to a hardcoded `2026` in SQL is unacceptable, stop and ask before inventing `platform_settings` — client-only soft-lock is an acceptable interim for beta (document the hole).

---

## Acceptance

1. New leagues get `season = 2026` by default (UI + DB default).
2. Admin Import defaults to 2026; override exists; CSV `SeasonID` must match or import aborts.
3. Successful import writes `game_stats.season = 2026` and finalize with `p_season = 2026` updates the beta league’s WLT when the league row is 2026.
4. QB / live card reads for a 2026 league do not mix in 2025 `game_stats` when both years exist.
5. Keep-league(s) on prod/local are `season = 2026` after Phase B; orphan 2025 test data removed only if intended.
6. Ops docs say `--year 2026` and point at `scoring/2026/`.
7. Phase C (if shipped): past seasons hidden by default and not writable; readable standings/schedule remain.
8. Live service has no multi-hour outage; data mutate is a short, verified window after code deploy.

---

## Implementation order (agent checklist)

```
0. Inspect SQL on target DB → verify: cutover notes (keep / drop / update ids)
1. A1 CURRENT_SEASON + wire Create / API defaults → verify: create league season 2026 locally
2. A2 + A3 Admin season + CSV SeasonID → verify: import 2026 CSV; mismatch aborts
3. A4 QB reads by season → verify: mixed-year seed does not cross-contaminate
4. A5 migration defaults (optional same PR) → verify: migrate up clean
5. Deploy Phase A to prod → verify: site up; admin can still operate (override 2025 if data not aligned yet)
6. Phase B data align → verify: smoke League home WLT + finalize 2026
7. Phase C purge + My Leagues filter + soft-lock (can be follow-up PR) → verify: acceptance 5–7
8. Docs/wiki + mark this brief shipped
```

Each step has a verify gate. Do not start Phase B until Phase A is deployed (or local-only if cutting over local first). Do not purge until Phase B smoke passes.

---

## Out of scope

- Product archive browser for 2025 test data
- Historical NFL kickoff archive / `matchups.season`
- Auto-renew / clone league for new year
- `platform_settings.current_season` (defer until year flip without deploy is required)
- Changing legacy `/archive` UX
