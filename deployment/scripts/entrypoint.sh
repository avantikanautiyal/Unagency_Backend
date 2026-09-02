#!/bin/sh
# Production entrypoint — role selected by SERVICE_ROLE (no backend redesign).
set -eu

ROLE="${SERVICE_ROLE:-api}"
echo "[unagency] starting service role=${ROLE}"

case "$ROLE" in
  api|business|direct|intelligence)
    # Existing compiled Express/platform host
    exec node dist/index.js
    ;;
  worker)
    # Workers share the same artifact; worker loop is selected via env in app config
    export WORKER_MODE=true
    exec node dist/index.js
    ;;
  background)
    export BACKGROUND_MODE=true
    exec node dist/index.js
    ;;
  migration)
    # Persistence migrations — invoke via script without inventing Intelligence modules
    if [ -f /app/deployment/scripts/run-migrations.js ]; then
      exec node /app/deployment/scripts/run-migrations.js
    fi
    if [ -f /app/dist/platform/persistence/factories/create-persistence-platform.js ]; then
      exec node -e "require('./deployment/scripts/run-migrations-inline.js')"
    fi
    echo "[unagency] migration role: running npm-based migrate placeholder"
    exec node /app/deployment/scripts/run-migrations.js
    ;;
  *)
    echo "[unagency] unknown SERVICE_ROLE=${ROLE}" >&2
    exit 1
    ;;
esac
