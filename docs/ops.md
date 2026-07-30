# Ops notes (Phase 6.6)

## Production deploy

```bash
export DOMAIN=your.domain.tld
export JWT_SECRET="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD="$(openssl rand -hex 16)"
# optional:
export RESEND_API_KEY=re_...
export EMAIL_FROM="BQBL <noreply@your.domain.tld>"
export SENTRY_DSN=https://...@sentry.io/...
export VITE_SENTRY_DSN=https://...@sentry.io/...

docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtains TLS certificates for `$DOMAIN` automatically (ports 80/443 must be reachable).

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

1. **Thursday** — remind managers to set lineups (email when Resend is live; manual until then).
2. **Lineup deadline** — managers set + lock via League Lineups; opponents stay hidden until the week is locked.
3. **Finalize Week** — commissioner: Admin → Weekly Lineups → Finalize Week (auto-starts empty lineups from lowest draft picks, locks the week).
4. **Sunday/Monday** — platform admin uploads the week CSV at `/admin/import` (requires platform-admin grant above).
5. **Confirm** — LeagueView scores, standings, WLT chart, matchup modal; re-running finalize is safe (idempotent).

Dry-run verifier (compose up): `node scripts/verify-a3-weekly-ops.mjs`

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
