-- Season 2025 → 2026 data cutover (local/prod runbook)
-- Run inspect queries first; replace KEEP_IDS before mutating.
-- Prod: human-gated only — do not auto-run from CI.

-- === Phase 0: Inspect (read-only) ===
-- SELECT id, name, season, draft_status FROM leagues ORDER BY season, created_at;
-- SELECT season, week, COUNT(*) FROM game_stats GROUP BY season, week ORDER BY season, week;

-- === Phase B: Align keep leagues (local keep ids from 2026-09-29 inspect) ===
-- UPDATE leagues SET season = 2026 WHERE id IN (
--   '8338d96c-fdd5-42ab-9b76-006cbb7e0ecb',  -- tuna
--   '7d311cbd-e4a3-45a3-9927-cd27eec1436d',  -- Offline UI League
--   '3c618501-8650-43dc-b3fd-e8a9f21305d0'   -- Playoff UI Check
-- );

-- If game_stats already imported under 2025 for beta weeks:
-- UPDATE game_stats SET season = 2026 WHERE season = 2025 AND week IN (1, 2);

-- === Phase C: Purge orphan 2025 test leagues (after Phase B smoke) ===
-- DELETE FROM leagues WHERE season = 2025 AND id NOT IN (
--   '8338d96c-fdd5-42ab-9b76-006cbb7e0ecb',
--   '7d311cbd-e4a3-45a3-9927-cd27eec1436d',
--   '3c618501-8650-43dc-b3fd-e8a9f21305d0'
-- );
-- DELETE FROM game_stats WHERE season = 2025;
