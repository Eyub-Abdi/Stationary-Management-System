#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PostgreSQL backup for the KJ Stationary database.
#
# Creates a compressed custom-format dump (pg_dump -Fc) that supports selective,
# parallel restore. Keeps the last $RETENTION_DAYS days of backups.
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/backup.sh
#   BACKUP_DIR=/var/backups/kj RETENTION_DAYS=14 ./scripts/backup.sh
#
# Schedule (cron, daily at 02:00):
#   0 2 * * *  cd /app && DATABASE_URL=... ./scripts/backup.sh >> /var/log/kj-backup.log 2>&1
# ---------------------------------------------------------------------------
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (postgresql://...)}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/kj_${STAMP}.dump"

echo "[backup] dumping to $OUT"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$OUT"

# Integrity check: the dump must list a table of contents.
pg_restore --list "$OUT" >/dev/null
echo "[backup] ok ($(du -h "$OUT" | cut -f1))"

# Prune old backups.
find "$BACKUP_DIR" -name 'kj_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete
echo "[backup] pruned backups older than ${RETENTION_DAYS} days"
