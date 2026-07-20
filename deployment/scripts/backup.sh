#!/usr/bin/env bash
# Database backup using Persistence abstractions + pg_dump when available.
set -euo pipefail
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_DIR:-./deployment/backups/artifacts}"
mkdir -p "$OUT_DIR"
echo "backup_id=bak_${STAMP}" > "$OUT_DIR/backup_${STAMP}.meta"
if command -v pg_dump >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  pg_dump "$DATABASE_URL" | gzip > "$OUT_DIR/postgres_${STAMP}.sql.gz"
  echo "postgres dump written"
else
  echo "pg_dump skipped (DATABASE_URL or pg_dump missing) — use Persistence backup API"
fi
echo "Backup metadata at $OUT_DIR/backup_${STAMP}.meta"
