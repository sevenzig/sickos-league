# BQBL Platform Buildout Plan

**Goal:** Turn the existing sickos-league codebase into a full multi-league fantasy football platform — Yahoo/Sleeper/ESPN-grade league management with the BQBL game model (draft NFL teams, bad-QB scoring).

**Scope decisions (locked in):**

| Decision | Choice |
|---|---|
| Game model | BQBL: 8 fantasy teams × 4 NFL teams = all 32 drafted; bad-QB scoring |
| Draft | Async turn-based **or** live draft room (commissioner chooses at league setup). Live: lobby opens 1h before `draft_at`, autostart, 30/60/90s clock, pause/resume, alphabetical auto-pick on timeout. No chat / no ranked queue. |
| Stats | Manual CSV upload, one site-wide upload per week serves all leagues |
| League size | Fixed 8×4; no free agency, no undrafted teams |
| Mid-season management | Weekly lineups + team identity only; no trades or waivers |
| Audience | Private friend leagues now; architecture must not block public launch later |

**Non-goals (explicitly out of scope):** player-level fantasy, draft chat / ranked pick queues, automated stats APIs, trades/waivers, variable league sizes, playoffs bracket customization.

---

## 1. Current State (verified against the codebase)

### Works today

| Area | Evidence |
|---|---|
| Auth + profiles | Supabase auth, `user_profiles`, photo upload (`src/pages/EditProfile.tsx`, `UserProfile.tsx`) |
| League creation | `create_league` RPC + `src/pages/CreateLeague.tsx`; owner fantasy team auto-created (`20241031000006_auto_create_owner_team.sql`) |
| Invites | `league_invitations` table, `redeem_invite_code` RPC, `InviteManager`/`JoinWithCode`/`InviteRedeem` |
| Membership | `league_members` with roles; users can belong to multiple leagues (`get_user_leagues`) |
| Lineup storage | `fantasy_lineups` table + `set_fantasy_lineup` / `get_fantasy_lineups_for_week` RPCs |
| CSV scoring pipeline | `parseWeeklyCSV` → `importWeeklyCSV` → `game_stats`. Keyed by `team_abbr + week + season` with precomputed `final_score` — **league-agnostic, already serves all leagues from one upload** |
| Scoring engine | `src/utils/scoring.ts` (`calculateScore`, `calculateTeamScore`, `getDetailedScoringBreakdown`) |
| Proven game loop | Legacy single-league path (`AdminLineups.tsx`, `Home.tsx`) runs the full model: roster-constrained pick-2-of-4, per-team + per-week locks, CSV → scores → standings |

### Broken or stubbed

| Issue | Location |
|---|---|
| Schedule generator packs 1 matchup/week instead of 4 | `generate_league_schedule` in `20241031000003_schedule_generation.sql` (lines 53–66: `week_num` increments per matchup) |
| No roster ownership — `fantasy_teams` has no link to NFL teams; `set_fantasy_lineup` accepts any of the 32 | `20241029000200_clean_infrastructure.sql`; `20241029000202_clean_functions.sql` |
| No draft — only a `draft_at` timestamp and marketing copy; `set_draft_time` RPC exists only in `supabase/migrations/backup/` | `leagues.draft_at`, `TeamSlots.tsx:155` |
| Lineups/schedule/standings routes are "Coming Soon" | `App.tsx` lines ~104–129 |
| `LeagueView` scores hardcoded to 0 with placeholder team names; `isWeekLocked` always false | `src/pages/LeagueView.tsx` lines 35–36, 107–128 |
| `v_league_standings` view queried by UI but never created in active migrations | `LeagueHome.tsx` |
| Week-lock RPCs (`set_week_lock`, `get_week_status`) live only in `migrations/backup/` | `src/utils/multiLeagueApi.ts` 395–466 calls them |
| `LeagueDashboard` reads `slots_filled` but RPC returns `fantasy_teams_count` | `LeagueDashboard.tsx` |
| Invite list maps `invite.leagues.name` without joining leagues | `multiLeagueApi.ts` ~267–270 |

### Missing entirely

- Roster table and 32-team uniqueness enforcement
- Draft state machine (order, turns, picks, completion)
- Notifications (email/in-app) for "your pick" and week reminders
- Self-serve manager lineup page
- Wired standings/matchup scoring in the multi-league path

---

## 2. Architecture Principles

1. **Postgres is the referee.** All game rules (roster uniqueness, pick validity, turn order, lineup membership, locks) are enforced in RPCs/constraints, not just the UI. This is what makes public launch safe later — the client is untrusted.
2. **One `game_stats` upload, many leagues.** Never add `league_id` to `game_stats`. Scoring is a pure function: `(lineup NFL teams, week) → sum of final_score`.
3. **Reuse the legacy engine.** `scoring.ts`, the `AdminLineups` roster-grid UX, and `calculateTeamRecords` are proven. Port, don't rewrite.
4. **Async-first draft.** A draft is just a table of picks and a turn pointer. Realtime is a progressive enhancement (Supabase Realtime subscription on the picks table), not a requirement.
5. **Additive migrations only**, matching the existing rollout doc convention (`docs/full-implementation.md`).

---

## 3. Build Phases

Each step lists a **verify** criterion per the goal-driven-execution guideline. Phases 0–4 produce a playable season. Phases 5–6 are polish and public-readiness.

---

### Phase 0 — Foundation Fixes (~2 days)

Fix what's broken before building on it.

**0.1 Fix `generate_league_schedule` (round-robin packing)**
- Rewrite using the circle method: with 8 teams, 7 rounds × 4 concurrent matchups; repeat rounds (alternating home/away) to fill weeks 1–18 (rounds 8–14 = rematch, 15–18 = third meeting of rounds 1–4).
- Guard: refuse to generate unless the league has exactly 8 fantasy teams AND the draft is complete (gate added in Phase 2).
- **Verify:** SQL test — generate for a seeded 8-team league; assert every week 1–18 has exactly 4 matchups and every team appears exactly once per week.

**0.2 Create `v_league_standings`** (or a `get_league_standings` RPC)
- Wins/losses/ties/points-for per fantasy team, derived from `league_matchups` where scores are recorded.
- **Verify:** `LeagueHome` standings render non-empty for a league with recorded scores.

**0.3 Promote week-lock RPCs from `migrations/backup/`**
- Move `set_week_lock` / `get_week_status` into an active migration; confirm `toggle_week_lock` signature matches what `multiLeagueApi.ts` calls.
- **Verify:** `setWeekLock` / `getWeekStatus` calls from the client succeed against a dev database.

**0.4 Small wiring fixes**
- `LeagueDashboard`: read `fantasy_teams_count` (or alias in RPC).
- `getLeagueInvitations`: join `leagues` for the name, or drop the field.
- **Verify:** dashboard shows correct team count; invite list shows league names.

---

### Phase 1 — Roster Ownership (~1–2 days)

The structural heart of the game: fantasy teams own NFL teams.

**1.1 Migration: `fantasy_team_rosters`**

```sql
CREATE TABLE fantasy_team_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    nfl_team_id UUID NOT NULL,          -- references teams.uuid_id
    acquired_via TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'commissioner'
    draft_pick_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (league_id, nfl_team_id)      -- an NFL team belongs to ONE roster per league
);
```

- Partial index/constraint to cap 4 NFL teams per fantasy team (enforced in the draft-pick RPC; a trigger is optional belt-and-suspenders).
- RLS: league members read; writes only via SECURITY DEFINER RPCs.

**1.2 Enforce roster membership in `set_fantasy_lineup`**
- Add a check: every submitted NFL team must exist in the caller's `fantasy_team_rosters` row set for that league. Keep the existing count check against `teams_started_per_week`.
- **Verify:** RPC test — lineup with a non-rostered team raises an exception; a rostered lineup of the correct size succeeds.

**1.3 Client API**
- `MultiLeagueApi.getTeamRoster(fantasyTeamId)` and `getLeagueRosters(leagueId)` (for the draft board and roster pages).
- **Verify:** roster renders on a seeded dev league.

---

### Phase 2 — Async Snake Draft (~3–4 days)

The only genuinely new feature. Modeled as a state machine in Postgres.

**2.1 Migration: draft state**

```sql
-- On leagues: draft_status TEXT DEFAULT 'pending'
--   ('pending' | 'in_progress' | 'complete'), draft_current_pick INTEGER

CREATE TABLE draft_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    pick_number INTEGER NOT NULL,        -- 1..32
    round INTEGER NOT NULL,              -- 1..4
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id),
    nfl_team_id UUID,                    -- NULL until picked
    picked_at TIMESTAMPTZ,
    UNIQUE (league_id, pick_number),
    UNIQUE (league_id, nfl_team_id)      -- no NFL team drafted twice
);
```

**2.2 RPC: `start_draft(p_league_id, p_draft_order UUID[])`**
- Commissioner-only. Requires exactly 8 fantasy teams. Order supplied by commissioner or randomized server-side if NULL.
- Pre-creates all 32 pick slots in snake order (rounds 1&3 forward, 2&4 reverse), sets `draft_status = 'in_progress'`, `draft_current_pick = 1`.
- **Verify:** picks table has 32 rows, 4 per team, correct snake sequence.

**2.3 RPC: `make_draft_pick(p_league_id, p_nfl_team_id)`**
- Validates: draft in progress; caller manages the fantasy team on the clock (`draft_current_pick`); NFL team not yet taken.
- In one transaction: fill the pick row, insert into `fantasy_team_rosters`, advance `draft_current_pick`; on pick 32 set `draft_status = 'complete'`.
- Commissioner override variant (`make_draft_pick_for`) for absent managers.
- **Verify:** RPC test — out-of-turn pick fails; duplicate NFL team fails; 32 sequential picks complete the draft and produce 8 rosters of 4 covering all 32 teams.

**2.4 Draft UI: `/leagues/:id/draft`**
- Draft board: 32-team grid (reuse `TeamLogo` + the `NFL_TEAMS` constant from `src/types.ts`), taken teams greyed with the drafting team's name; pick history sidebar; "You're on the clock" banner when it's the caller's turn.
- Poll `get_draft_state` on load/focus; optionally subscribe to `draft_picks` via Supabase Realtime for instant updates when multiple managers are online (enhancement, not requirement).
- **Verify:** two browser sessions (two accounts) complete a full 32-pick draft in dev.

**2.5 Notifications (async draft depends on this)**
- Minimal viable: in-app — `MyLeagues` and the league dashboard show a prominent "Your pick!" badge (derived from draft state, no new tables).
- Email: Supabase Edge Function triggered on pick advance (or a DB webhook) → "You're on the clock in {league}". Can land after 2.4; in-app badge ships first.
- **Verify:** after a pick, the next manager's `MyLeagues` shows the badge without a manual refresh loop deeper than page load.

**2.6 Gates**
- `generate_league_schedule` requires `draft_status = 'complete'`.
- League joins/invites close once the draft starts.
- **Verify:** schedule RPC raises before draft completion; invite redemption fails for in-progress drafts.

---

### Phase 3 — Self-Serve Weekly Lineups (~1–2 days)

Port the proven legacy UX to per-manager multi-league.

**3.1 Page: `/leagues/:id/lineups`** (replaces "Coming Soon")
- Port the roster-card grid from `AdminLineups.tsx` (lines 326–422) but scoped to *the caller's own team*: their 4 rostered NFL teams, pick exactly `teams_started_per_week`, save + lock buttons.
- Week selector defaults to current week; past/locked weeks read-only.
- Show opponent's lineup only after the week locks (standard fantasy convention).
- **Verify:** manager can set/lock a lineup; a second account cannot modify it; non-rostered teams never appear.

**3.2 Commissioner lineup view**
- On `LeagueAdmin`: all 8 teams' lineup status for the week (locked/complete/missing), with override + "finalize week" (calls the week-lock RPC) — the legacy `finalizeWeeklyLineups` flow, per league.
- **Verify:** finalize locks all lineups and the week; further edits blocked at the RPC level.

**3.3 Missed-lineup policy**
- Simplest rule (recommended): when the commissioner finalizes a week, teams without a saved lineup auto-start their lowest-pick-number rostered teams. Deterministic, no notifications required.
- **Verify:** finalizing with a missing lineup produces a valid auto-lineup.

---

### Phase 4 — Scoring, Matchups, Standings (~2 days)

Wire the CSV pipeline into the multi-league views.

**4.1 UUID ↔ abbreviation mapping**
- `game_stats` is keyed by `team_abbr`; lineups store `teams.uuid_id`. Add/confirm an abbreviation column on `teams` and a single mapping helper used everywhere (extend the existing `teamNameMap` in the legacy utils rather than inventing a second map).
- **Verify:** round-trip test for all 32 teams.

**4.2 Scoring RPC or view: `get_league_scores(p_league_id, p_week)`**
- For each matchup: each side's score = sum of `game_stats.final_score` for the NFL teams in that fantasy team's locked lineup for that week. NULL (not 0) when stats or lineups are missing.
- Persist results onto `league_matchups` (`team1_score`, `team2_score`, `winner`) when the week is finalized *and* stats exist — an idempotent `finalize_week_scores` RPC the CSV import (or admin) can trigger for all leagues at once.
- **Verify:** seeded league + real week-1 CSV → matchup scores match hand-computed sums from `scoring.ts` values.

**4.3 Replace `LeagueView` stubs**
- Real lineups, real scores, real `isWeekLocked` (from `get_week_status`), real records via `v_league_standings`. Delete the mock Chiefs/Packers placeholder data and the WLT stubs; wire `SeasonWLTChart` to recorded weekly results.
- **Verify:** `LeagueView` for a dev league shows correct scores/records; zero TODO mock-data comments remain in the file.

**4.4 Matchup detail modal**
- The legacy `MatchupModal` + `getDetailedScoringBreakdown` already render per-QB breakdowns — point them at the multi-league lineup + `game_stats` data.
- **Verify:** clicking a completed matchup shows per-team QB stat breakdowns matching the CSV.

**4.5 CSV import stays site-wide**
- Keep `/admin/import` as a platform-admin function (not per-league). After import, run `finalize_week_scores` across all leagues with locked lineups for that week.
- **Verify:** one upload updates two different dev leagues' matchup scores.

---

### Phase 5 — League Management Polish (~2–3 days)

Commissioner toolkit + the UX layer that makes it feel like a real product.

- **5.1 Commissioner dashboard** (`LeagueAdmin`): draft controls (set order, start, override picks), member management (remove member pre-draft, transfer commissioner), schedule regenerate (pre-season only), week finalize, delete league (currently "Coming Soon"). *Verify: each action audit-logged to `audit_logs`.*
- **5.2 Team identity**: team name (exists via `update_fantasy_team_name`) + logo/avatar (reuse the profile-photo storage pattern from `ProfilePhotoUpload`). *Verify: logos render in matchups/standings.*
- **5.3 League home** (`/leagues/:id`): route properly (currently orphaned `LeagueHome.tsx`); this week's matchups with live scores, standings, draft-status callout pre-draft. *Verify: navigation flows Welcome → MyLeagues → LeagueHome → lineup/matchup pages without dead ends.*
- **5.4 Season chart + records**: `SeasonWLTChart` and `RecordTable` on real data.
- **5.5 Route consolidation**: register schedule/standings routes, remove remaining "Coming Soon" placeholders.

---

### Phase 6 — Public-Readiness (~3–5 days, deferred until needed)

Not required for friends leagues; do before opening signup.

- **6.1 RLS audit**: every table policy reviewed with a written matrix (member/commissioner/platform-admin × read/write); pen-test the RPCs with a non-member account.
- **6.2 Retire `VITE_ENABLE_MULTI_LEAGUE`**: multi-league becomes the only path; legacy single-league data either migrated into a league or archived read-only.
- **6.3 Platform admin role**: distinguish site admin (CSV upload, user support) from league commissioner — currently conflated.
- **6.4 Email infrastructure**: transactional email (invites, draft turns, weekly lineup reminders) via Edge Functions + a provider (Resend/Postmark).
- **6.5 Onboarding**: public landing page, create-or-join flow, empty states.
- **6.6 Ops**: error tracking (Sentry), DB backups schedule, rate limiting on public RPCs.
  - **Weekly kickoffs (friend-launch):** Before Thursday lock for week N, load NFL
    kickoff times so per-team lineup locks fire. Platform admin runs
    `node scripts/seed-nfl-kickoffs.mjs --week N --file <schedule.json>`
    (see `scripts/data/week-kickoffs.example.json`) or calls
    `upsert_nfl_kickoff_times(p_week, p_games)`. Missing `game_time` leaves that
    NFL team editable — do not skip TNF/early games.

---

## 4. Sequencing & Effort Summary

```
Phase 0  Foundation fixes            ~2 days   ─┐
Phase 1  Roster ownership            ~1–2 days  ├─ Critical path to
Phase 2  Async snake draft           ~3–4 days  │  a playable season:
Phase 3  Self-serve lineups          ~1–2 days  │  ~2–2.5 weeks
Phase 4  Scoring & standings         ~2 days   ─┘
Phase 5  Management polish           ~2–3 days
Phase 6  Public-readiness            ~3–5 days (defer until public launch)
```

Dependencies: 1 → 2 → (3, and schedule gate in 0.1); 4 depends on 1+3; 5 anytime after 2; 6 last.

**Recommended milestone cut:** ship after Phase 4 to your friend group for a real season. Phase 5 improves quality-of-life during the season; Phase 6 waits for public ambitions.

## 5. Open Questions / Risks

1. **Draft order fairness** — random vs. commissioner-set is a per-league choice in `start_draft`; default random.
2. **`teams.uuid_id` vs abbreviation mapping** is the likeliest source of silent scoring bugs (name-format drift like "LA Chargers" vs "LAC"). Phase 4.1's round-trip test is mandatory before any real week is scored.
3. **Mid-draft abandonment** — a manager who never picks stalls an async draft. Mitigation: commissioner override (2.3) covers it; a pick deadline + auto-pick can be added later without schema changes.
4. **Legacy league** — the current friends league lives on the legacy path. Decide before next season whether to migrate its history into a league row or keep it as an archive.
5. **`game_stats` seasons** — the table already has `season`; the UI mostly assumes one season. Multi-season support (league renewal) is a Phase 6+ concern but the schema won't fight it.
