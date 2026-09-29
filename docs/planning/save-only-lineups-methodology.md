# Save-only lineups (drop voluntary Lock)

**Purpose:** Managers set and save a weekly lineup. Slots freeze at NFL kickoff (per team) and when the commissioner finalizes the week. Remove voluntary **Lock Lineup** so the product matches the usual fantasy model: pick starters → save → games lock themselves.
**Prerequisite:** Kickoff freeze + bye locks shipped (`docs/ops.md`, `db/migrations/20241031000036_kickoff_freeze_and_byes.sql`, verify-nfl-kickoff-locks).
**Date:** 2026-09-27
**Status:** ready-to-run (not shipped)

Follow `~/wiki/rules/writing_general.md` and coding behavior (project `.claude/skills` / wiki draft `coding_behavior`): state assumptions, keep changes surgical, verify before expanding scope.

---

## Positioning (locked)

1. **One manager action: Save Lineup.** No Lock Lineup button, no confirm that freezes the whole roster early.
2. **What still freezes edits:** per-team NFL kickoff; seeded bye; `weeks.is_locked` (finalize).
3. **What no longer freezes edits:** `fantasy_lineups.is_locked` from a manager click.
4. **Column stays.** `fantasy_lineups.is_locked` remains finalize-owned. Do not drop it. Do not backfill/clear historical rows unless a live league is stuck — prefer leave alone.
5. **Disable `lock_fantasy_lineup` for managers** (revoke execute or replace body with a clear exception). Do not leave a dead button.
6. **Save still requires a complete starter set.** No autosave in this pass.
7. **Opponent visibility** — saved starters are visible to league members on Home / Schedule / Lineups (changed from hide-until-week-lock; see `20241031000043`).
8. **Commissioner finalize stays** — auto-fill, lock lineups, lock week; owner override on `set_fantasy_lineup` stays.
9. **Copy:** card countdown **Starts in …** / **Started**; reserve “locked” for week/finalize chrome. No card color redesign.
10. **Legacy** `SetLineups` / `AdminLineups` / `LeagueContext.lockTeamLineup` stay out of scope unless a verify script still depends on them.

---

## What changes vs today

| Today | After |
|---|---|
| Save + Lock Lineup | Save Lineup only |
| `canEdit` blocked by week lock **or** voluntary lineup lock | `canEdit` blocked by week lock (plus per-team kickoff/bye) |
| `set_fantasy_lineup` rejects when `fl.is_locked` | Reject only on week lock / kickoff / bye / roster rules |
| Managers call `lock_fantasy_lineup` | RPC revoked or raises; finalize still sets `is_locked` |
| Cards say “Locks in …” | “Starts in …” |

---

## Code map

| Piece | Location |
|-------|----------|
| Manager UI | `src/pages/LeagueLineups.tsx` |
| Client API | `MultiLeagueApi.lockFantasyLineup` → `src/utils/multiLeagueApi.ts` |
| RPC allowlist | `server/src/rpc.ts` |
| Voluntary lock RPC | `lock_fantasy_lineup` (orig. `20241031000014_…`; use live definition) |
| Lineup write + `lineup_locked` gate | Live `set_fantasy_lineup` in `20241031000036_kickoff_freeze_and_byes.sql` |
| Finalize | `finalize_week_lineups` — still sets `is_locked` |
| Commissioner UI | `src/components/league/CommissionerLineups.tsx` |
| Ops | `docs/ops.md` |
| Verify | `scripts/verify-phase3.mjs` §3.1; `scripts/verify-a3-weekly-ops.mjs` |
| Security matrix | `docs/security-matrix.md` |

---

## Hard boundaries — must NOT touch

- Autosave
- Opponent reveal timing (still week lock)
- Dropping `fantasy_lineups.is_locked`
- Card color redesign (emerald / blue / slate)
- ESPN ingest, bye detection, scoring CSV
- Legacy single-league lineup pages unless verifies require it

---

## Open before coding (confirm only if blocked)

- Historical `is_locked = true` while week still open: after removing the gate, those managers can edit again until week lock / kickoff. **Intentional.** If a live league must stay frozen mid-week without finalize, stop and ask — do not invent a new flag.
- Incomplete lineups stay unsavable. Draft/partial saves = separate methodology.

---

## Acceptance

1. Manager UI has **Save Lineup** only — no Lock Lineup control.
2. After save, manager can change non-kicked-off starters while the week is unlocked.
3. TNF kickoff freeze still holds; Sunday slots stay editable (existing freeze tests).
4. After `finalize_week_lineups`, non-owners cannot edit; week locked; opponents reveal as today.
5. Manager call to `lock_fantasy_lineup` fails (revoked or explicit exception).
6. `node scripts/verify-phase3.mjs` (and a3 weekly ops if touched) green for lineup sections.
7. Ops doc no longer says managers “set + lock.”
8. After ship: wiki `decisions.md` + `apis.md` updated (tracking only — plan stays in this file).

---

## Agent prompts (paste-ready)

### Prompt — full pass

```
Implement docs/planning/save-only-lineups-methodology.md in sickos-league.

Goal: managers Save Lineup only; freeze at NFL kickoff + week finalize; remove voluntary Lock Lineup.

Do:
1. New migration: set_fantasy_lineup must NOT block non-owners solely on fantasy_lineups.is_locked (keep week lock, kickoff freeze, bye, roster/starter rules; owners override). Disable lock_fantasy_lineup (REVOKE EXECUTE from authenticated OR replace body with clear exception). finalize_week_lineups still sets is_locked + week lock.
2. LeagueLineups.tsx: remove Lock Lineup button/handler/state; Save Lineup only; canEdit = hasGameThisWeek && !weekLocked; drop myLineupLocked / Lineup Locked badge; remove opponent Locked chip tied to voluntary lock; kickoffLabel "Locks in" → "Starts in".
3. Remove MultiLeagueApi.lockFantasyLineup call sites/method; rpc allowlist only if RPC fully removed.
4. Update docs/ops.md, docs/security-matrix.md, verify-phase3.mjs §3.1 (and verify-a3-weekly-ops.mjs if it calls lock_fantasy_lineup). Do not weaken kickoff/finalize coverage.
5. After green verifies: update ~/wiki/projects/sickos-league/decisions.md and apis.md (shipped decision + API note). Do not move this methodology into the wiki.

Surgical only. No autosave, no reveal-on-save, no column drop, no card recolor, no legacy SetLineups rewrite unless verifies require it.
```

### Suggested order

1. Migration + API restart  
2. UI Save-only + copy  
3. Client API cleanup  
4. Verifies + ops + security-matrix  
5. Wiki decisions/apis after green  

---

## Wiki after ship (tracking only)

- `~/wiki/projects/sickos-league/decisions.md` — mark save-only as shipped; link this file path  
- `~/wiki/projects/sickos-league/apis.md` — note `lock_fantasy_lineup` disabled; manager edit gates  
- Do **not** copy the full methodology into the wiki  
