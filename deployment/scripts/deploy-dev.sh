#!/usr/bin/env bash
# Deploy development stack via Docker Compose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/deployment/docker-compose"
docker compose -f docker-compose.development.yml up -d --build
docker compose -f docker-compose.development.yml ps
