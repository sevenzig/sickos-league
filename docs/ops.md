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

## Health

- API: `GET /api/health`
- Compose healthcheck hits that endpoint before bringing up Caddy.
