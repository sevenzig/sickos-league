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

1. **Wednesday ~9pm America/New_York** — platform admin: ESPN kickoff sync for weeks `N`, `N+1`, `N+2` (`node scripts/sync-nfl-kickoffs-espn.mjs --year YYYY --weeks N,N+1,N+2`). Season start: `--all-season` (weeks 1–18). Confirm the current week is seeded before TNF; bye pills appear only after seed.
2. **Thursday** — remind managers to set lineups (email when Resend is live; manual until then).
3. **Lineup deadline** — managers save lineups via League Lineups; per-team freeze at NFL kickoff; opponents stay hidden until week finalize. Bye-week teams cannot be started.
4. **Finalize Week** — commissioner: Admin → Weekly Lineups → Finalize Week (auto-starts empty lineups from lowest draft picks, skipping NFL byes when seeded; locks the week).
5. **Sunday/Monday** — platform admin uploads the week CSV at `/admin/import` (requires platform-admin grant above).
6. **Confirm** — LeagueView scores, standings, WLT chart, matchup modal; re-running finalize is safe (idempotent).

Dry-run verifier (compose up): `node scripts/verify-a3-weekly-ops.mjs`  
Kickoff freeze / bye locks: `node scripts/verify-nfl-kickoff-locks.mjs`  
Offline manual schedule (7-week template / mid-season rewrite): `node scripts/verify-offline-schedule.mjs`

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
