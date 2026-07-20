#!/bin/sh
set -eu
PORT="${PORT:-3000}"
# Prefer /v1/health when Enterprise API is mounted; fallback to classic /health
if curl -fsS "http://127.0.0.1:${PORT}/v1/health" >/dev/null 2>&1; then
  exit 0
fi
if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  exit 0
fi
exit 1
