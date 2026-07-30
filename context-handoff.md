## Meta
date: 2026-07-28
spec-ref: repair-spec.md 2026-07-28
brief-ref: repair-brief.md 2026-07-28
findings-ref: debug-findings.md 2026-07-28
review-ref: review-pass.md 2026-07-28
map-ref: codebase-map.md 2026-07-28
map-status: current

## Problem
Prompt A2 needed the uncommitted Phase 2–5 launch tree and live DB coherent. `verify-phase2` failed mid-draft (`That NFL team has already been drafted`); `verify-phase5` failed fantasy_teams inserts under SELECT-only RLS; `multiLeagueApi` still called four RPCs absent from allowlist and the live DB.

## Root Cause
Harness drift after bot autopick (000026) and SELECT-only member RLS (000021): phase2 assumed fixed NFL-team indexes while `get_draft_state` auto-picks unmanaged seats; phase5 still wrote `fantasy_teams` via the API. Confidence: high. Missing migrations and allowlist gaps in the running image were ruled out.

## Changes Made
- `scripts/verify-phase2.mjs` — pick next untaken NFL team; skip bot-on-clock after `get_draft_state` autopick.
- `scripts/verify-phase5.mjs` — seed invites, teams, draft_status, logo_url via psql.
- `src/utils/multiLeagueApi.ts` — removed dead `setDraftTime` / slot-invite RPC wrappers.
- `src/components/league/TeamSlots.tsx` — remapped to `getLeagueFantasyTeams`.
- Commit `5cbe783` also landed migrations 000023–000028, auth username, draft UI/server allowlist, and related client pages (full A2 land). Kickoffs 000029–000030 were already in `25d3c24`.

## Preserved / Out of Scope
- No resurrection of backup-era slot invite RPCs.
- No new product features beyond existing uncommitted work.
- Manual browser smoke deferred; phase 2–5 verifiers used as gate.
- JA artifacts / `.claude-flow` / `scripts/main.py` / `presort.py` not committed.

## Open Questions
- Username `23505` detail parsing reliability for duplicate-username messaging.
- Fresh-volume bootstrap path not exercised beyond long-lived compose `pgdata`.
- Whether `scripts/main.py` / `presort.py` matter for later ops prompts.

## Current Status
Resolved. Commit `5cbe783` on `main`. Phase 2–5 verifiers exited 0 against live compose before commit.

## Map State
`codebase-map.md` updated incremental post-commit; status current. Next session may trust the map for A2 launch scope; re-orient only if scope expands (e.g. Prompt A3 weekly ops dry run).
