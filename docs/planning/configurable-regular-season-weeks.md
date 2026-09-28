# Configurable regular season length (14 / 15 / 16)

**Purpose:** Let the commissioner choose whether the regular season ends after week 14, 15, or 16. Playoffs start the next week. The NFL calendar is 18 weeks, so a 16-week regular season only leaves room for a 4-team bracket. Drop 8-team playoffs entirely (field is 4, 5, or 6).
**Prerequisite:** Playoffs + fixed 14-week season (`20241031000035`); offline 7-week template (`20241031000040`).
**Date:** 2026-09-28
**Status:** shipped — 2026-09-28 (`20241031000041_configurable_regular_season.sql`)

Follow `~/wiki/rules/writing_general.md` and coding behavior (project `.claude/skills`): state assumptions, keep changes surgical, verify before expanding scope.

---

## Positioning (locked)

1. **`regular_season_weeks` is commissioner-owned.** Allowed values: **14, 15, or 16**. Default stays **14**. Column already exists; relax the `= 14` check.
2. **Playoffs start at `regular_season_weeks + 1`.** Seeds use only regular-season weeks `1..regular_season_weeks`. Bracket advance and finalize hooks key off that boundary, not hardcoded 14/15.
3. **Playoff field is 4, 5, or 6.** Remove **8**. Update DB check, create/settings RPCs, UI, Rules copy, and verify scripts.
4. **Week-16 regular season ⇒ 4-team playoffs only.** NFL ends at week 18. A 5- or 6-team bracket needs three playoff weeks and would require week 19. Refuse the combo with a clear error; do not auto-coerce.
5. **Championship week:**
   | `regular_season_weeks` | `playoff_teams` | Playoffs | Ends |
   |---|---|---|---|
   | 14 | 4 | 15–16 | 16 |
   | 14 | 5 or 6 | 15–17 | 17 |
   | 15 | 4 | 16–17 | 17 |
   | 15 | 5 or 6 | 16–18 | 18 |
   | 16 | 4 | 17–18 | 18 |
   | 16 | 5 or 6 | — | **invalid** |
6. **Same edit gate as today.** `regular_season_weeks`, `playoff_teams`, and tiebreaker stay editable until the first `is_playoff` row exists. Then locked.
7. **Matchup cycle is a 7-week round, then wrap.** Home/away:
   - Weeks **1–7**: first pass
   - Weeks **8–14**: same pairs, sides **flipped**
   - Week **15** = week **1** (identical sides, not flipped again)
   - Week **16** = week **2** (identical sides)
   Shared rule: `round_idx = (week - 1) % 7`; flip when `floor((week - 1) / 7) % 2 = 1` (true for 8–14 only in the 14–16 range).
8. **Changing length after a schedule exists appends or trims regular-season rows** (playoff rows untouched):
   - **Increase** (e.g. 14 → 15/16): append missing weeks from the cycle using the existing week-1–7 pairings (same orientation rule as above). Do not rewrite weeks that already exist.
   - **Decrease** (e.g. 16 → 14): delete non-playoff `league_matchups` with `week > new regular_season_weeks`.
   - Length change goes through season settings (same gate). Schedule generate / offline save still write the full slate for the current length.
9. **All three draft modes.** Async, live, and offline. Offline keeps the **7-week template**; server expands to `regular_season_weeks` (56 / 60 / 64 games). Async/live auto-gen and Randomize use the same cycle bound.
10. **Leagues stay 8 fantasy teams.** No change to roster count.

---

## What changes vs today

| Today | After |
|---|---|
| `regular_season_weeks` always 14 | 14, 15, or 16; default 14 |
| Playoffs always start week 15 | Start at `regular_season_weeks + 1` |
| Field 4, 5, 6, or 8 | Field **4, 5, or 6** only |
| Auto-gen / offline expand hardcode 1..14 | Bound = `leagues.regular_season_weeks`; week 15/16 wrap as week 1/2 |
| `seasonMaxWeek` assumes RS=14, champ 16 or 17 | Champ = RS+2 (4-team) or RS+3 (5/6); never past 18 |
| Create / Admin: playoff size only | Also choose regular-season end week; playoff options filter when RS=16 |
| Length change does nothing to matchups | Increase appends; decrease deletes trailing RS rows |

---

## Target user flow

1. Creates league; picks regular season **14 / 15 / 16** and playoff field **4 / 5 / 6** (5/6 hidden or disabled when RS=16).
2. Async/live: draft start / Randomize builds weeks `1..RS` with the cycle rule.
3. Offline: enters weeks 1–7; save expands through `RS` (8–14 flipped; 15=1; 16=2 when applicable).
4. Mid-pre-bracket, changes RS 14 → 16: settings save appends weeks 15–16 from cycle; playoff start becomes 17; only 4-team field allowed — if field was 5/6, save fails with an error until they pick 4.
5. Changes RS 16 → 14: trailing weeks 15–16 regular-season rows deleted; playoffs again start at 15.
6. Once any playoff row exists, season settings (including RS length) refuse edits.

---

## Code map

| Piece | Location |
|-------|----------|
| Column + checks | `leagues.regular_season_weeks`, `leagues.playoff_teams` — live defs from `20241031000035` (+ later superseding migrations) |
| Create / settings RPCs | `create_league`, `set_league_season_settings` |
| Auto schedule | `_generate_league_schedule_impl` — today `FOR week_num IN 1..14` |
| Offline expand | `set_league_schedule` offline branch — today expands 8–14 only (`20241031000040`) |
| Playoff advance | `_advance_playoffs_impl` / `generate_playoffs` — week-14 complete gate, first playoff week |
| Client season helpers | `src/utils/season.ts` (`REGULAR_SEASON_WEEKS`, `seasonMaxWeek`, `PlayoffTeams`) |
| API | `MultiLeagueApi.createLeague` / `setLeagueSeasonSettings` — `src/utils/multiLeagueApi.ts` |
| UI | `CreateLeague.tsx`, `LeagueAdmin.tsx` (season settings + offline grid helper copy), `Rules.tsx`, week chrome callers of `seasonMaxWeek` |
| Verify | `scripts/verify-playoffs.mjs`, `scripts/verify-offline-schedule.mjs`; extend or add RS-length cases |
| Docs / wiki | `docs/ops.md` if needed; wiki `apis.md` / `decisions.md` / project index after ship |

---

## Surgical work items

### A. Schema + settings

- Relax `leagues_regular_season_weeks_check` to `IN (14, 15, 16)`.
- Change `leagues_playoff_teams_check` to `IN (4, 5, 6)`. **Before** the new check: `UPDATE leagues SET playoff_teams = 6 WHERE playoff_teams = 8` (or 4 — pick 6 as “still a larger field”; document in migration comment).
- Extend `set_league_season_settings` to take `p_regular_season_weeks`. Validate 14/15/16; playoff 4/5/6; **if RS=16 and playoff ≠ 4 → raise** (clear message: week-16 regular season only supports a 4-team playoff because the NFL season ends at week 18).
- On successful settings update when a regular-season schedule already exists:
  - If new RS > old: for each missing week, insert four games from the cycle (derive pairs from week `((w-1)%7)+1`; apply flip rule). Prefer reading an existing source week’s pairs over re-running seating random.
  - If new RS < old: `DELETE` non-playoff matchups with `week > new RS`.
  - If no regular-season rows yet: settings-only update (generate/offline save later).
- `create_league`: accept optional `p_regular_season_weeks` (default 14); same combo validation; stop accepting playoff 8.
- Audit details include `regular_season_weeks`.

### B. Schedule generation + offline expand

- `_generate_league_schedule_impl`: loop `1..regular_season_weeks` for that league; keep `% 7` + flip-for-second-cycle logic (already yields week 15≈1, 16≈2 if the upper bound grows). Audit `weeks_generated` / matchup count dynamic.
- Offline `set_league_schedule`: still **28 games in** (weeks 1–7). Expand to `1..RS`:
  - 8–14: flipped copies of 1–7 (unchanged)
  - 15: copy of week 1 (no flip)
  - 16: copy of week 2 (no flip)
  - Replace non-playoff rows for weeks `1..RS` only; leave playoff rows alone. Mid-season rewrite rules for offline unchanged.
- Async/live `set_league_schedule` (if still used): expect `RS * 4` games, pre-season gate unchanged.
- `generate_league_schedule` still refuses offline.

### C. Playoffs

- Replace hardcoded “week 14 complete / start week 15” with `regular_season_weeks`.
- First playoff week = `RS + 1`. Refuse generate when that week (or later) already holds non-playoff games — same spirit as today’s “regular-season games after week 14” block, generalized.
- Bracket pairing logic unchanged (4 / 5 / 6 only; delete 8-team branch).
- `finalize_week_scores` advance trigger: from `RS` onward, not from 14.
- `seasonMaxWeek`: if no playoff rows → `RS`; if playoffs → `RS+2` when field=4 else `RS+3` (assert ≤ 18).

### D. UI + copy

- Create League + League Admin: control for regular season end (14 / 15 / 16). Playoff select: 4 / 5 / 6; when RS=16, only 4 selectable (disable or omit 5/6). End-week labels must be **dynamic** from RS (not hardcoded “ends week 16/17”).
- Offline Admin helper text: weeks 8–14 flip; if RS≥15, week 15 repeats week 1; if RS=16, week 16 repeats week 2.
- Rules page + any “always 14 / start week 15 / 8-team playoff” copy.
- Do not redesign Admin beyond these controls.

### E. Verify

- Create with RS=14/15/16 and valid playoff sizes.
- RS=16 + playoff 5 or 6 → error; no partial write.
- Auto-gen RS=16 → 64 RS rows; week 15 pairs/sides = week 1; week 16 = week 2; weeks 8–14 flipped vs 1–7.
- Offline save with RS=15 → 60 rows; mid-season rewrite still OK; playoff rows untouched.
- Settings 14→16 appends 15–16 without rewriting 1–14; 16→14 deletes 15–16 RS rows.
- Playoffs: RS=15, 4-team → rounds in 16–17; RS=16, 4-team → 17–18; RS=14, 6-team still ends 17.
- No remaining path accepts `playoff_teams = 8`.
- Existing verify-playoffs / offline-schedule suites updated; no regress on join-code / draft verifies that only mention “8 fantasy teams.”

---

## Hard boundaries — must NOT touch

- Scoring finalize math, lineup freeze, NFL kickoff ingest
- Draft pick / roster RPCs (except create_league params already in scope)
- Consolation / losers bracket
- Non-8 fantasy-team leagues
- Redesign of week chrome beyond using the updated `seasonMaxWeek`
- CSV import of full schedules

---

## Open before coding (only if blocked)

- **Existing `playoff_teams = 8` rows:** migration coerces to **6** before the new check. If a live league is mid-bracket with 8, stop and ask — do not invent a special bracket migrate in this pass.
- **Append source when weeks 1–7 are incomplete / inconsistent:** settings-increase should require a full valid week-1–7 (or full current RS slate) to derive new weeks; otherwise raise. Do not invent opponents.

---

## Acceptance

1. Commissioner can set RS to 14, 15, or 16 at create and in Admin until a playoff row exists.
2. RS=16 rejects playoff field 5 or 6 with a clear error; 4 succeeds; championship in week 18.
3. Auto-gen and offline expand produce the correct week count; 15≡1 and 16≡2 (sides identical); 8–14 remain flipped 1–7.
4. Increasing RS appends cycle weeks; decreasing deletes trailing RS weeks; playoffs untouched.
5. Playoff generate/advance keys off `regular_season_weeks`; no hardcode on 14/15 left in those paths.
6. Playoff field 8 is gone from DB, RPCs, UI, and verifies.
7. Verify scripts cover the cases above; prior playoff/offline checks still pass where still valid.

---

## Implementation order

1. Migration: coerce playoff 8→6; relax RS check; update create + `set_league_season_settings` (validation + append/trim); schedule impl + offline expand; playoff gates.
2. Client: `season.ts`, API args, Create League, League Admin, Rules, any hardcoded 14/15/8 playoff copy.
3. Verify scripts + wiki `apis.md` / `decisions.md` / project index when shipping.

---

## Out of scope

- Regular seasons other than 14–16
- Restoring 8-team playoffs
- Per-week manual edit without full offline template rewrite
- Auto-changing playoff size when RS becomes 16 (refuse only)
