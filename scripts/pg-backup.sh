#!/bin/sh
# Nightly pg_dump with 14-day rotation. Used by the backup compose service.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/sickos-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "Backing up to $FILE"
pg_dump "$DATABASE_URL" | gzip -c > "$FILE"
echo "Done."

# Drop files older than retention
find "$BACKUP_DIR" -type f -name 'sickos-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete || true
