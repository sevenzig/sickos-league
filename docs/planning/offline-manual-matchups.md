# Offline draft — manual matchups (7-week template + mid-season override)

**Purpose:** Offline draft is a migration path. The commissioner already has rosters and a matchup slate from an offline league. They must be able to enter that slate on their own schedule — before or after entering lineups/scores — without the pre-season freeze that blocks regenerate today.
**Prerequisite:** Offline draft shipped (`20241031000034`); 14-week regular season + `set_league_schedule` (`20241031000035`); League Admin manual grid (`LeagueAdmin.tsx`).
**Date:** 2026-09-28
**Status:** shipped (`20241031000040_offline_manual_schedule.sql`; verify: `node scripts/verify-offline-schedule.mjs`)

Follow `~/wiki/rules/writing_general.md` and coding behavior (project `.claude/skills`): state assumptions, keep changes surgical, verify before expanding scope.

---

## Positioning (locked)

1. **Offline = full manual schedule mode.** Async and live start on this platform and keep auto round-robin. Offline does not.
2. **No auto-generate for offline.** `start_offline_draft` must stop calling `_generate_league_schedule_impl`. `generate_league_schedule` / Randomize stay for non-offline only.
3. **Commissioner configures 7 weeks**, four games each, every team once per week. That is one full round for an 8-team league.
4. **Weeks 8–14 expand from the template** with the same pairings and **home/away flipped** (match today’s circle-method second pass).
5. **Playoffs unchanged.** Weeks 15+ stay on `generate_playoffs` / existing bracket rules. Manual slate is regular season only.
6. **Mid-season override for offline only.** Locked weeks and completed matchup scores must not block saving a new offline slate. Saving replaces regular-season rows for weeks 1–14 (including already-played weeks). Leave playoff rows alone.
7. **Order does not matter.** Admin may set matchups before or after offline draft finalize, lineup entry, week lock, or score finalize. Do not invent a new “schedule locked” gate for offline.
8. **Leagues are 8 teams.** Schedule still requires exactly 8 fantasy teams. No 4/5/6-team schedule work in this pass.
9. **Async/live keep today’s pre-season gate.** No mid-season rewrite; no manual editor in Admin for those modes (Randomize + draft-start auto-gen only).
10. **Reuse `set_league_schedule` shape where it fits.** Prefer extending that RPC (or a thin offline-only sibling) over a parallel schedule system. Client still talks through `MultiLeagueApi`.

---

## What changes vs today

| Today | After |
|---|---|
| `start_offline_draft` auto-generates if no matchups | Offline never auto-generates |
| Manual Admin grid is 14 weeks for every mode | Offline: 7-week template; expand on save. Async/live: no manual grid |
| `set_league_schedule` requires 56 games; fails once any week locked or any matchup complete | Offline: accept 7-week template (28 games) **or** expand client-side to 56; save allowed after locks/scores. Non-offline: keep pre-season 56-game gate |
| Copy: “Locked after a week is finalized or a score is recorded” | Offline copy: can rewrite anytime; warn that save replaces weeks 1–14 including scored weeks |

---

## Target user flow (offline commissioner)

1. Creates league with `draft_mode = offline`, fills 8 teams.
2. Either starts offline draft / enters picks, **or** opens League Admin → Regular season and assigns weeks 1–7 first.
3. For each of weeks 1–7: picks four `team1` / `team2` pairs (all eight teams, no duplicates, no self-play).
4. Saves. Server writes weeks 1–7 as given; writes weeks 8–14 as the same pairs with sides flipped.
5. Later, after locking/scoring weeks 1–2, notices pairings are wrong → opens the same 7-week editor → fixes → saves again. Weeks 1–14 regular-season matchups are replaced. Existing scores on deleted rows are gone; commissioner re-enters scores if needed.
6. Playoff generation still waits on week 14 complete; unchanged.

---

## Code map

| Piece | Location |
|-------|----------|
| Offline draft start (auto-gen today) | `start_offline_draft` — live body from `db/migrations/20241031000034_offline_draft.sql` (still present after later migrations unless superseded — confirm live def) |
| Async/live draft start auto-gen | `start_draft` — keep for non-offline |
| Schedule impl + pre-season gate | `_generate_league_schedule_impl`, `generate_league_schedule` — `20241031000035_playoffs.sql` |
| Manual set RPC | `set_league_schedule(p_league_id, p_matchups)` — same migration |
| RPC allowlist | `server/src/rpc.ts` |
| Client API | `MultiLeagueApi.generateSchedule` / `setLeagueSchedule` — `src/utils/multiLeagueApi.ts` |
| Admin UI | `src/pages/LeagueAdmin.tsx` (`blankManualGrid`, `handleSaveManual`, Randomize button, Regular season panel) |
| Verify | `scripts/verify-playoffs.mjs` (manual 56 + regenerate gate); add or extend an offline-schedule verify |
| Docs | `docs/ops.md`, `docs/security-matrix.md`; wiki `apis.md` / `decisions.md` after ship |

---

## Surgical work items

### A. Stop offline auto-schedule

- Remove the `IF NOT EXISTS (league_matchups) THEN PERFORM _generate_league_schedule_impl` block from `start_offline_draft` only.
- Leave `start_draft` (async/live) auto-gen as-is.
- `generate_league_schedule` / Randomize: refuse when `draft_mode = 'offline'` with a clear error (manual path only).

### B. Offline schedule write (mid-season OK)

- Owner-only; `draft_mode` must be `offline`; exactly 8 fantasy teams.
- Input: either **28 games (weeks 1–7 × 4)** as the locked product shape, or keep accepting 56 if the client expands — pick one contract and document it. Prefer **28 in, server expands** so the flip rule lives in one place.
- Validate weeks 1–7: each week exactly 4 games, 8 distinct teams, no self-play, all IDs in-league.
- Expand: for `w` in 8..14, copy week `(w - 7)` pairs with `team1`/`team2` swapped.
- Replace **only** non-playoff `league_matchups` for weeks 1–14. Do not delete `is_playoff` rows.
- **No** check on `weeks.is_locked` or `league_matchups.is_complete` for offline.
- Audit: action `SET`, details include `source: offline_manual`, `template_weeks: 7`, `matchups_written: 56`.
- Non-offline callers of `set_league_schedule`: keep today’s 56-game + pre-season gate (or hide the UI and leave RPC gated).

### C. League Admin UI

- **Offline:** show 7-week manual grid as the primary schedule control. No Randomize. Helper text: weeks 8–14 repeat with home/away flipped; save may overwrite scored weeks.
- Prefill from existing weeks 1–7 when present.
- **Async/live:** keep Randomize; remove or hide “Assign manually.” Pre-season-only messaging stays accurate for those modes.
- Do not redesign the rest of Admin.

### D. Verify

- Offline: `start_offline_draft` leaves `league_matchups` empty.
- Offline: save 7-week template → 56 regular-season rows; weeks 8–14 are flipped copies of 1–7.
- Offline: after locking week 1 and marking a matchup complete, save still succeeds and rewrites weeks 1–14; playoff rows (if any) untouched.
- Offline: `generate_league_schedule` rejected.
- Async/live: auto-gen on draft start unchanged; `set_league_schedule` still fails after a week lock; no regress on `verify-playoffs.mjs` pre-season cases.

---

## Hard boundaries — must NOT touch

- Playoff bracket logic / `generate_playoffs`
- Scoring finalize, lineup freeze, NFL kickoff ingest
- Draft pick / roster assignment RPCs beyond removing offline auto-schedule
- Field sizes other than 8 for schedule
- Dropping `set_league_schedule` for async/live pre-season use (gate stays; UI may hide)

---

## Open before coding (only if blocked)

- **Scored week rewrite:** deleting completed matchup rows drops stored scores for those games. Intentional for migration correction. Do not invent score carry-over onto new opponent pairs. If a live production league needs a softer “edit future weeks only” mode, stop and ask — do not add a second path in this pass.
- **Existing offline leagues** that already have an auto-generated slate: first open of the 7-week editor should load weeks 1–7 from current rows so the commissioner can edit rather than re-enter from blank.

---

## Acceptance

1. Offline draft start never creates `league_matchups`.
2. Offline commissioner can save a 7-week slate with 8 teams joined; DB has correct weeks 1–14 with flip on 8–14.
3. Same save works after week locks and completed scores; regular-season rows are replaced; playoffs untouched.
4. Offline cannot Randomize / `generate_league_schedule`.
5. Async/live still auto-generate on draft start; still cannot rewrite schedule after the season starts; no manual 7-week UI.
6. Verify script covers the offline cases above; existing playoff/manual pre-season checks still pass for non-offline.

---

## Implementation order

1. Migration: offline `start_offline_draft` without auto-gen; offline schedule set RPC (or branched `set_league_schedule`); offline refuse on `generate_league_schedule`.
2. Client API + League Admin UI split by `draft_mode`.
3. Verify script + ops/security-matrix + wiki apis/decisions when shipping.

---

## Out of scope

- Importing a CSV/JSON of an entire offline season in one shot (beyond the 7-week grid)
- Editing a single week without rewriting 1–14
- Changing regular_season_weeks away from 14
- Non-owner schedule edits
