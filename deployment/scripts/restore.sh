#!/usr/bin/env bash
# Restore from backup artifact / Persistence restore point.
set -euo pipefail
BACKUP_META="${1:?usage: restore.sh <backup.meta>}"
echo "Restoring from $BACKUP_META"
echo "1) Stop API/workers (kubectl scale or compose stop)"
echo "2) Restore Postgres dump if present"
echo "3) Run migration job"
echo "4) Scale API back up"
echo "See deployment/runbooks/restore.md"
