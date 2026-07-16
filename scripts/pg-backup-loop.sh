#!/bin/sh
# Runs pg-backup.sh once per day inside the backup container.
set -eu
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

echo "Backup loop started (every ${INTERVAL_SECONDS}s)"
while true; do
  /scripts/pg-backup.sh || echo "Backup failed at $(date -u)"
  sleep "$INTERVAL_SECONDS"
done
