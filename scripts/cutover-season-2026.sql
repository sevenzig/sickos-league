-- Season 2025 → 2026 data cutover
-- Preferred path: migration 20241031000046_align_season_to_2026.sql
-- (API migrate on boot — UPDATE all leagues + game_stats 2025→2026).
-- This file is a manual fallback if you need to run SQL before a rebuild.

-- === Inspect (read-only) ===
-- SELECT id, name, season, draft_status FROM leagues ORDER BY season, created_at;
-- SELECT season, week, COUNT(*) FROM game_stats GROUP BY season, week ORDER BY season, week;

-- === Align (2025 was test label only; live beta must be 2026) ===
-- UPDATE leagues SET season = 2026 WHERE season = 2025;
-- UPDATE game_stats SET season = 2026 WHERE season = 2025;

-- Soft-lock compares league.season < CURRENT_SEASON (2026). Leaving
-- live leagues on 2025 makes lineups show "Archived season" and blocks Save.
