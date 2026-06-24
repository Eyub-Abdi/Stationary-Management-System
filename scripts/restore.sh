#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Restore a KJ Stationary backup produced by scripts/backup.sh.
#
# WARNING: --clean drops and recreates objects in the TARGET database. Point
# DATABASE_URL at the database you intend to overwrite (ideally restore into a
# fresh/staging DB first and verify before touching production).
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/restore.sh ./backups/kj_20260623_020000.dump
# ---------------------------------------------------------------------------
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (postgresql://...)}"
DUMP="${1:?Usage: restore.sh <path-to-.dump>}"
[ -f "$DUMP" ] || { echo "[restore] file not found: $DUMP" >&2; exit 1; }

echo "[restore] restoring $DUMP into target database"
echo "[restore] press Ctrl-C within 5s to abort…"
sleep 5

pg_restore \
  --dbname="$DATABASE_URL" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --jobs=4 \
  "$DUMP"

echo "[restore] done"
