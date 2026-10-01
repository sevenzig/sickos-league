-- Align live data to platform year 2026.
-- 2025 was a testing label only; beta leagues and stats must not stay on 2025
-- or client soft-lock (season < CURRENT_SEASON) treats them as archived.

UPDATE leagues
SET season = 2026
WHERE season = 2025;

UPDATE game_stats
SET season = 2026
WHERE season = 2025;
