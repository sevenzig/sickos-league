# Ops notes (Phase 6.6)

## Production deploy

Stack listens on **127.0.0.1:8084** (host Caddy terminates TLS). Does not bind 80/443/3000/3001/8082/8083.

```bash
export DOMAIN=badqb.space
export JWT_SECRET="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
# optional:
export RESEND_API_KEY=re_...
export EMAIL_FROM="BQBL <noreply@badqb.space>"
export SENTRY_DSN=https://...@sentry.io/...
export VITE_SENTRY_DSN=https://...@sentry.io/...

docker compose -f docker-compose.prod.yml up -d --build
```

Host `/etc/caddy/Caddyfile` (alongside your other sites):

```caddy
badqb.space, www.badqb.space {
	encode gzip zstd
	reverse_proxy 127.0.0.1:8084
}
```

Then: `caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy`

## Backups

The `backup` service runs `scripts/pg-backup.sh` daily, writing `sickos-*.sql.gz` into the `backups` volume and deleting files older than 14 days.

Local (optional profile):

```bash
docker compose --profile backup up -d backup
```

### Restore

```bash
# copy a dump out of the volume, then:
gunzip -c sickos-YYYYMMDDTHHMMSSZ.sql.gz | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U postgres postgres
```

For a scratch restore, create a separate database first and pipe into that name instead of `postgres`.

## Platform admin

Grant site admin (CSV import, finalize scores) via SQL:

```sql
UPDATE auth.users SET is_platform_admin = true WHERE email = 'you@example.com';
```

Then sign out/in so the JWT picks up the flag.

## Weekly season loop (checklist)

1. **NFL kickoffs (automatic on API)** — API boots seed `matchups.game_time` from ESPN (full weeks 1–18 if the table is empty; otherwise current week `N..N+2`). Wednesday **21:00 America/New_York** re-syncs `N..N+2`. Needs a platform-admin user (`is_platform_admin`). Disable with `NFL_KICKOFF_SYNC=0`; season year via `NFL_SEASON_YEAR` (default 2026). Manual fallback still works: `node scripts/sync-nfl-kickoffs-espn.mjs --year 2026 --weeks N,N+1,N+2` (or `--all-season`). Bye pills appear only after a week is seeded.
2. **Thursday** — remind managers to set lineups (email when Resend is live; manual until then).
3. **Lineup deadline** — managers save lineups via League Lineups; per-team freeze at NFL kickoff; saved starters are visible to league members on Home / Schedule / Lineups. Bye-week teams cannot be started. (Optional: commissioner **Finalize Week** in League Admin earlier in the week to lock lineups before scores land.)
4. **Sunday/Monday** — platform admin uploads the week CSV from `scoring/2026/BQBL-2026_WEEK-NN.csv` at `/admin/import` (requires platform-admin grant above). Season defaults to **2026**; CSV `SeasonID` must match or import aborts. Import writes `game_stats` and runs `platform_finalize_week`: auto-fills empty lineups, locks every league’s week, persists matchup scores (`is_complete`). Standings + W/L/T update from that step. Re-run with **Finalize Week** on the same page if a prior upload only wrote stats.
5. **Confirm** — LeagueView scores, standings, WLT chart, matchup modal; re-running finalize is safe (idempotent).

Dry-run verifier (compose up): `node scripts/verify-a3-weekly-ops.mjs`  
Season cutover checks: `node scripts/verify-season-cutover.mjs`  
Kickoff freeze / bye locks: `node scripts/verify-nfl-kickoff-locks.mjs`  
Offline manual schedule (7-week template / mid-season rewrite): `node scripts/verify-offline-schedule.mjs`

## Season year cutover (2025 test → 2026 beta)

Platform current season is `CURRENT_SEASON = 2026` in `src/utils/currentSeason.ts`. Bump once per calendar year.

**Prod data align** (human-gated; run inspect SQL on prod first):

1. Short window — no overlapping CSV import / finalize.
2. `UPDATE leagues SET season = 2026 WHERE id IN (/* keep ids from inspect */);`
3. If stats were imported as 2025: `UPDATE game_stats SET season = 2026 WHERE season = 2025 AND week IN (…);` or re-import from `scoring/2026/` and finalize each week.
4. Smoke League home WLT; kickoff sync `--year 2026`.
5. After smoke: purge orphan `season = 2025` leagues/stats only.

Template SQL (dry-run comments): `scripts/cutover-season-2026.sql`

## Live draft ticker

Live-mode drafts (autostart at `draft_at`, pick-clock expiry, bot auto-pick) advance
via a `setInterval` inside the single API process (`server/src/email.ts` →
`tickLiveDrafts()`, every 5s), not a separate worker. This is single-node by
design (fine for a friend-group launch) — if the API process is down, live
drafts pause silently: no autostart, no pick-clock expiry, no bot advance,
until the process is back up (an open browser tab polling `get_draft_state`
covers the gap for that one league, but nothing else). Verify with
`node scripts/verify-live-draft.mjs`.

## Health

- API: `GET /api/health`
- Compose healthcheck hits that endpoint before bringing up Caddy.
