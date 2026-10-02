-- FG game-winning drives are encoded as Gwd=0.5 in BQBL CSVs (ZGwd=-6).
-- INTEGER truncated those to 0 on import; NUMERIC preserves the half-credit.

ALTER TABLE game_stats
  ALTER COLUMN game_winning_drive TYPE NUMERIC
  USING game_winning_drive::numeric;

COMMENT ON COLUMN game_stats.game_winning_drive IS
  'GWD flag from CSV: 1 = TD GWD (−12), 0.5 = FG GWD (−6), 0 = none';
