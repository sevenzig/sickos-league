## Meta
last-updated: 2026-07-28
updated-by: incremental — source: view other teams' rosters from StandingsTable / SeasonWLTChart
coverage: Prior A2–A3 + live-draft coverage, plus roster-read UI gap: `get_team_roster` / `get_league_rosters` (`000012`), `MultiLeagueApi.getTeamRoster` / `getLeagueRosters`, `StandingsTable` / `SeasonWLTChart` / `LeagueView` / `LeagueStandingsPage`, commissioner-only roster cards in `CommissionerLineups.tsx`, MatchupModal click pattern on LeagueView

## Entry Points
- `docker compose` services `api` + `db` — API on `:3001`, Postgres on host `:5433`; `./db` bind-mounted read-only into API as `/app/db`.
- `migrate()` (`server/src/db.ts`) — on API boot: runs `bootstrap.sql`, applies unapplied `db/migrations/*.sql` (files only, sorted), records `schema_migrations`, runs `seed.sql`.
- `POST /api/rpc/:fn` (`server/src/rpc.ts`) — authenticated; allowlisted fn name → signature lookup in `pg_proc` → `runAsUser` SQL call.
- `POST /api/auth/signup` / `POST /api/auth/login` (`server/src/auth.ts`) — signup requires `username` matching `/^[a-zA-Z0-9_]{3,32}$/`; login accepts `identifier` or `email` or `username`.
- `MultiLeagueApi.*` (`src/utils/multiLeagueApi.ts`) — frontend RPC bindings for MyLeagues / Draft / Lineups / Admin / Import / schedule / standings.
- Manager lineups UI: `src/pages/LeagueLineups.tsx` — set + lock own week lineup via `setFantasyLineup` / `lockFantasyLineup`.
- Commissioner finalize UI: `src/components/league/CommissionerLineups.tsx` — `finalizeWeekLineups` → RPC `finalize_week_lineups`.
- Platform CSV import: `src/services/csvImporter.ts` `importWeeklyCSV` — writes `game_stats`, then calls `finalize_week_scores`.
- League season UI: `src/pages/LeagueView.tsx` (+ Schedule) — schedule scores via `useMatchupScores`, standings consumers, MatchupModal.
- Platform admin grant: `docs/ops.md` — `UPDATE auth.users SET is_platform_admin = true WHERE email = ...` then re-login.
- `scripts/verify-phase{0,2,3,4,5,6-pentest}.mjs` — phase contract verifiers against live API/DB.
- Fixture week-1 CSV: `weekly-scoring-data/BQBL 2025 WEEK 01.xlsx - fdata_week01.csv`.
- `startEmailWorkers()` (`server/src/email.ts`, called once from `server/src/index.ts:75` on boot) — `setInterval(tickLiveDrafts, 5000)` runs independent of any client request/browser; `tickLiveDrafts` issues `SELECT draft_tick_all()` via `adminPool` (service_role, bypasses RLS/auth.uid()).
- `src/pages/dev/FeatDraftSandbox.tsx` (`/dev/feat_draft`, DEV-only route) — one-click league create + `fill_draft_bots` + `start_draft` for async or live mode, for manual reliability testing.
- Roster read RPCs: `get_team_roster(p_fantasy_team_id)` / `get_league_rosters(p_league_id)` (`000012`) — league-member gated via `is_league_member`; allowlisted in `server/src/rpc.ts`; client bindings `MultiLeagueApi.getTeamRoster` / `getLeagueRosters`.
- Standings UI: `StandingsTable` used on `LeagueView` and `LeagueStandingsPage`; `SeasonWLTChart` used on `LeagueView` only. Neither currently opens a roster view on team click (team cells are display-only).
- Existing roster UI consumers: `LeagueLineups.tsx` (own roster only), `CommissionerLineups.tsx` (all rosters for lineup admin), legacy `Rosters.tsx` (single-league mock path at `/rosters`).

## Primary Data Flows
- Boot/migrations: API start → `migrate()` → bootstrap shims → apply pending files under `db/migrations` → seed → listen `:3001`.
- Live draft: UI → MultiLeagueApi draft RPCs → Postgres `000023`–`000027`.
- Schedule: commissioner/owner → `generate_league_schedule` → 72 `league_matchups` (18×4) for 8-team league.
- Manager lineup: LeagueLineups → `set_fantasy_lineup` / `lock_fantasy_lineup` (`000014` + kickoff gate `000029`) → `fantasy_lineups`; opponent lineups hidden until week lock (`000016`).
- Commissioner Finalize Week: CommissionerLineups → `finalize_week_lineups` → auto-fill incomplete lineups from lowest `draft_pick_number` → lock all lineups + `weeks.is_locked`.
- CSV → scores: platform admin `/admin/import` → `importWeeklyCSV` → delete/insert `game_stats` for week/season → `finalize_week_scores(p_week, p_season)` (platform-admin only, `000019`) → `compute_lineup_score` per side → UPDATE `league_matchups.team1_score/team2_score/is_complete` only when both sides non-NULL.
- Standings read: client SELECT `v_league_standings` (`000018`/`000028`) aggregates W/L/T/PF from completed `league_matchups` only.
- LeagueView scores: `get_league_schedule` persisted scores prefer when `is_complete`; else live sum from `game_stats` via `useMatchupScores` after week lock reveals lineups.
- Auth username / kickoff flows unchanged from A2 map.
- Live draft tick (server-side, no browser required): `index.ts` boot → `startEmailWorkers()` → `setInterval` 5s → `tickLiveDrafts()` → `draft_tick_all()` (SECURITY DEFINER, `service_role`-only) → for every `leagues` row with `draft_mode='live' AND draft_status IN ('pending','in_progress')`: `draft_ensure_live_started(id)` (autostart when `NOW() >= draft_at` and 8 teams exist) → `WHILE draft_expire_current_pick(id) LOOP` (timeout auto-pick: alphabetically-first undrafted NFL team via `draft_execute_pick(..., p_is_auto=TRUE)`, chains through `draft_pick_seconds` deadlines if the tick was delayed) → `draft_auto_pick_bots(id)` (loops while on-clock `fantasy_teams.manager_user_id IS NULL`, same alphabetical rule, `EXIT WHEN n>=32` safety cap). Same chain also runs, minus autostart, for `draft_mode='async' AND draft_status='in_progress'` (bot-only advance, no deadline set/spammed).
- Live draft tick (client-triggered, redundant path): `LeagueDraft.tsx` polls `get_draft_state` every 2s (live) / 10s (async) + on window `focus` → `get_draft_state` itself calls `draft_ensure_live_started` → `draft_expire_current_pick` → `draft_auto_pick_bots` before building its JSON payload, so an open browser tab advances the draft at least as fast as the server tick.
- Roster ownership read (exists, unused by standings/WLT): league member → `get_team_roster` / `get_league_rosters` → `fantasy_team_rosters` JOIN `teams` → up to 4 NFL teams per fantasy team (name, acquired_via, draft_pick_number). No write path from standings UI.
- LeagueView identity bridge: `fantasyTeams: FantasyTeam[]` loaded via `getLeagueFantasyTeams`; `SeasonWLTChart` receives only `teams: string[]` (names). `StandingsTable` already has `fantasy_team_id` per row from `v_league_standings`.
- Pause/resume: `pause_draft` (owner-only) sets `draft_paused=TRUE, draft_pick_deadline=NULL`; `resume_draft` (owner-only) sets `draft_paused=FALSE, draft_pick_deadline=NOW()+draft_pick_seconds`. `draft_expire_current_pick` and `draft_auto_pick_bots` both no-op while `draft_paused`. `draft_execute_pick` allows `p_is_auto=TRUE` calls through even when paused (guard is `IF league_paused AND NOT p_is_auto`) — i.e. a queued auto-pick that lands mid-pause is not blocked by the pause check itself, only by the tick functions choosing not to call it.
- Commissioner override: `make_draft_pick_for` (owner-only) → `draft_execute_pick(..., p_require_manager=FALSE, p_is_auto=FALSE)`, unaffected by pause state (same non-block as above) and unaffected by ticker changes.

## Key Interfaces and Contracts
- `schema_migrations` — shared — through `20241031000030_upsert_nfl_kickoff_times.sql` on live compose.
- `RPC_ALLOWLIST` — external — includes `finalize_week_lineups`, `finalize_week_scores`, `set_fantasy_lineup`, `lock_fantasy_lineup`, `generate_league_schedule`, `get_league_schedule`, draft + kickoff RPCs.
- `finalize_week_lineups(p_league_id, p_week)` — shared — owner-only; returns auto-fill count; locks week.
- `finalize_week_scores(p_week, p_season)` — shared — platform-admin only; site-wide; returns count of matchups finalized; idempotent recompute from `game_stats`.
- `compute_lineup_score` — internal — NULL if lineup missing/unlocked/incomplete stats; else SUM(`game_stats.final_score`) for full lineup.
- `game_stats.team_abbr` — shared — stores full team names matching `teams.name` (CSV `teamNameMap` in `csvParser.ts`).
- `league_matchups` scores — shared — `team1_score`/`team2_score`/`is_complete`; incomplete sides stay NULL; no separate `winner` column (derived from scores).
- `v_league_standings` — shared — W/L/T/PF from `is_complete` matchups only; member SELECT via `is_league_member` (`000028`).
- `get_league_schedule` — shared — returns scores + `week_locked` + `is_complete` for UI.
- Platform admin — shared — `auth.users.is_platform_admin`; JWT must refresh after SQL grant (`docs/ops.md`).
- Client scoring display — shared — `src/utils/scoring.ts` (client-side points) vs DB `game_stats.final_score` / `compute_lineup_score` (source of truth for persisted matchups).
- `draft_tick_all()` — external (service_role only; `REVOKE ... FROM PUBLIC/authenticated`) — advances every live/async draft one tick; called only from `server/src/email.ts` via `adminPool`; returns count of actions taken.
- `draft_ensure_live_started` / `draft_expire_current_pick` / `draft_auto_pick_bots` — internal (revoked from PUBLIC/authenticated) — SECURITY DEFINER helpers called only by `draft_tick_all` and `get_draft_state`; not directly reachable via `RPC_ALLOWLIST`.
- `leagues.draft_mode` / `draft_pick_seconds` / `draft_paused` / `draft_pick_deadline` / `draft_order` (`000023`) — shared — live-draft state columns; `draft_pick_deadline` is the sole timeout signal (`NULL` = no active deadline: async, paused, or complete).
- `draft_picks.is_auto` (`000027`) — shared — persists whether a pick was auto/timeout/bot vs manual, surfaced in `get_draft_state` `picks[].is_auto` and consumed by `LeagueDraft.tsx` for the "Auto-picked … you missed the clock" toast.
- `bqbl.draft_autostart` session GUC — internal — `start_draft` requires `auth.uid()` and owner role UNLESS this is set to `'on'`; only `draft_ensure_live_started` sets it (via `set_config(..., true)` = transaction-local) around its `PERFORM start_draft(...)` call, so autostart can run with no JWT.
- `get_team_roster` / `get_league_rosters` — shared — return roster ownership (not weekly starters); any league member may read any team's roster in that league; non-members get membership error.
- `RosterEntry` / `LeagueRosterEntry` (`multiLeagueApi.ts`) — shared — client shapes for those RPCs.
- Matchup deep-link pattern on LeagueView — shared — week cell click → `openWLTModal` / MatchupModal via URL params; team-name column in SeasonWLTChart has no equivalent click handler today.

## Implicit Contracts
- Week must be locked (`weeks.is_locked`) before `finalize_week_scores` will touch that league’s matchups.
- Both lineup sides must be fully scoreable or the matchup stays incomplete (NULL scores) — no partial finalize.
- Re-running `finalize_week_scores` overwrites scores from current `game_stats` (idempotent for unchanged stats; not additive to standings — standings are a view).
- CSV import deletes existing `game_stats` for that week/season before insert; then finalize is best-effort (non-fatal on import result).
- Opponent lineups hidden until week lock; manager path and commissioner path are separate UIs/RPCs.
- Full season rosters (owned NFL teams) are readable by any league member at any time; that is distinct from weekly starter lineups, which stay hidden until week lock.
- Eight fantasy teams + draft complete required before meaningful schedule (72 matchups) and season loop.
- Phase 4 verifier seeds via psql + promotes platform admin; unit verifier ≠ full UI dry run.
- Compose: server TS needs image rebuild; SQL bind-mounted.
- Live-draft progress depends on the API process being up and `startEmailWorkers()` having run; there is no separate worker/queue — if the single Node process dies or is not started, ticks stop and `draft_pick_deadline` timeouts silently stop firing until an open browser's `get_draft_state` poll (2s) or focus event picks up the slack, or the process restarts.
- `draft_tick_all`'s `WHILE draft_expire_current_pick(id) LOOP` assumes each call advances at most one pick per invocation and re-checks the fresh deadline each iteration; it relies on `draft_execute_pick` having already set the *next* pick's deadline before the next loop condition is evaluated (both run inside the same outer transaction per league via row-level `FOR UPDATE` locks acquired transiently, not one lock held across the whole tick).
- `draft_auto_pick_bots` has a hardcoded `EXIT WHEN n >= 32` ceiling as its only runaway-loop guard; correctness depends on `draft_execute_pick` always either completing a pick or the loop's other EXIT conditions (human on clock, no picks left, paused) becoming true first.
- No verifier script covers live-mode reliability (autostart timing, pick-clock expiry, pause/resume, ticker-without-browser) — `verify-phase2.mjs` has no `live`/`draft_mode`/`pause`/`draft_at` references; the only exercised live-mode path today is manual, via `FeatDraftSandbox.tsx` (DEV-only route) or hand-testing.

## Coupling Map
- `server/src/rpc.ts` — imports: db, auth — imported by: API index — risk: high
- `src/utils/multiLeagueApi.ts` — imports: apiClient/db — imported by: league pages/components — risk: high
- `db/migrations/20241031000014_lineup_locks_and_finalize.sql` — finalize_week_lineups / set/lock lineup — risk: high
- `db/migrations/20241031000017_week_scoring.sql` + `000019` — compute_lineup_score / finalize_week_scores — risk: high
- `src/services/csvImporter.ts` — imports: db, csvParser — imported by: admin import UI — risk: high
- `src/hooks/useMatchupScores.ts` — imported by: LeagueView, LeagueSchedule — risk: medium
- `src/pages/LeagueView.tsx` + StandingsTable / RecordTable / SeasonWLTChart / MatchupModal — risk: medium
- `src/components/league/StandingsTable.tsx` — imports: MultiLeagueApi, FantasyTeamAvatar — imported by: LeagueView, LeagueStandingsPage — risk: medium (shared standings surface)
- `src/components/tables/SeasonWLTChart.tsx` — imports: TeamLogo — imported by: LeagueView — risk: medium (name-keyed; needs fantasy_team_id bridge for roster fetch)
- `MultiLeagueApi.getTeamRoster` / `getLeagueRosters` — imports: db.rpc — imported by: LeagueLineups, CommissionerLineups — risk: low (read-only; ready for standings consumers)
- `docs/ops.md` platform-admin grant — ops boundary — risk: medium
- `scripts/verify-phase3.mjs` / `verify-phase4.mjs` — live API/DB harness — risk: medium
- `weekly-scoring-data/*` fixture CSV — risk: low
- `db/migrations/20241031000023_live_draft.sql` (`start_draft`, `draft_execute_pick`, `draft_ensure_live_started`, `draft_expire_current_pick`, `draft_tick_all` v1, `pause_draft`/`resume_draft`, `get_draft_state` v1) — imported by: `000024`/`000026`/`000027` (all `CREATE OR REPLACE` the same functions), `server/src/email.ts`, `LeagueDraft.tsx`, `DraftControls.tsx` — risk: high (every live-draft behavior change touches this file's functions via later migrations)
- `db/migrations/20241031000026_bot_autopick.sql` (`draft_auto_pick_bots`, `draft_tick_all` v2, `get_draft_state` v2) — imports: `draft_execute_pick`, `leagues`, `draft_picks`, `fantasy_teams` — imported by: `draft_tick_all`, `get_draft_state` — risk: high
- `server/src/email.ts` (`tickLiveDrafts`, `startEmailWorkers`) — imports: `adminPool` (`db.ts`), `cron` — imported by: `server/src/index.ts` boot — risk: high (sole non-browser trigger for live-draft ticks)
- `src/pages/LeagueDraft.tsx` — imports: `MultiLeagueApi`, `db`, `useAuth` — imported by: draft route — risk: medium (redundant client-side tick trigger via polling/focus)

## Unknowns
- Whether a dedicated dry-run league already exists in the live DB or must be created fresh for A3.
- Whether UI LeagueView paths are exercised beyond verify-phase4 API assertions (browser smoke deferred in A2).
- Username `23505` detail parsing reliability (inherited).
- Fresh-volume bootstrap path vs long-lived `pgdata` (inherited).
- Whether `scripts/main.py` / `presort.py` are required for A3 CSV ops (inherited; A3 has fixture CSV path).
- No verifier or automated test exercises live-draft autostart/expiry/pause-resume/no-browser bot-advance; only manual/sandbox coverage exists (see Implicit Contracts).
- Whether `draft_tick_all`'s per-league `FOR UPDATE` locking (acquired inside each helper call rather than held for the whole tick) can race a concurrent client `get_draft_state` poll calling the same helpers for the same league — not observed to fail, but not proven safe under concurrent ticks either.
- Whether a crashed/restarted API process (single-node, no supervisor config visible in this repo) is expected to be babysat manually for the "friend launch," or whether that ops dependency needs to be written down somewhere durable (currently undocumented outside this map).
- No player-facing UI currently surfaces another team's full roster from standings or SeasonWLTChart (gap motivating this feature).
- Whether RecordTable on LeagueStandingsPage should also open rosters is unspecified (user named standings + SeasonWLTChart only).

## Changelog
- 2026-07-28 — full — Initial map for Prompt 2 roster ownership scope (migrations, RPC allowlist, client bindings, verify-phase3).
- 2026-07-28 — full — Remapped coverage to Phase 4 scoring/standings (CSV→game_stats→finalize→league_matchups→v_league_standings, UI consumers, verify-phase4); noted absent get_league_scores RPC and platform-admin/RLS gates.
- 2026-07-28 — incremental — Expanded coverage to Prompt A1 kickoff pipeline: 000029 read/enforce path, SELECT-only `matchups` after 000020, absent write/seed path, LeagueLineups + getNflKickoffTimes wiring, CSV without kickoff columns.
- 2026-07-28 — full — Remapped to Prompt A2 launch-land: migrations 000023–000030 applied on live DB but untracked in git; allowlist/auth/bootstrap diffs; stale client RPCs (`get_league_slots` et al.); docker mount vs image rebuild contract; verifier/script surface.
- 2026-07-28 — incremental — A1 committed as `25d3c24`: `000029`+`000030`, kickoff allowlist entries, `upsertNflKickoffTimes`/`getNflKickoffTimes`, seed script, verify-phase3 A1 checks, ops note now tracked in git (000023–000028 remain untracked).
- 2026-07-28 — incremental — A2 committed as `5cbe783`: migrations 000023–000028 + draft/auth/UI land; multiLeagueApi allowlist-synced (dead slot RPCs removed); phase2/5 harnesses account for bot autopick and psql seeding; map marked current.
- 2026-07-28 — incremental — A3 scope expand: mapped manager/commissioner lineup finalize, CSV→finalize_week_scores, standings view, LeagueView score consumers, platform-admin ops grant, week-1 fixture CSV; noted dry-run league existence and browser smoke as unknowns.
- 2026-07-28 — incremental — Live-draft reliability task: mapped the full server-side tick chain (`startEmailWorkers` 5s interval → `tickLiveDrafts` → `draft_tick_all` → `draft_ensure_live_started` / `draft_expire_current_pick` / `draft_auto_pick_bots`) that already runs independent of any open browser, the redundant client-side poll/focus path in `LeagueDraft.tsx`, pause/resume semantics, `bqbl.draft_autostart` GUC, and `draft_picks.is_auto`; flagged the absence of any live-mode verifier as the main gap.
- 2026-07-28 — incremental — Roster-view feature scope: mapped existing `get_team_roster`/`get_league_rosters` + client bindings + member RLS; noted StandingsTable/SeasonWLTChart lack click-to-roster; distinguished roster ownership (always readable) from weekly lineups (hidden until lock); noted SeasonWLTChart is name-keyed while StandingsTable has `fantasy_team_id`.
