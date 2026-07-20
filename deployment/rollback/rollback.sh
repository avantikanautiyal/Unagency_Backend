#!/usr/bin/env bash
# Rollback Helm release or Compose stack.
set -euo pipefail
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true
RELEASE="${RELEASE:-unagency}"
NS="${NAMESPACE:-unagency}"
if $DRY_RUN; then
  echo "DRY-RUN: helm rollback $RELEASE 0 -n $NS"
  echo "DRY-RUN: kubectl -n $NS rollout undo deploy/${RELEASE}-api"
  exit 0
fi
helm rollback "$RELEASE" 0 -n "$NS"
kubectl -n "$NS" rollout status "deploy/${RELEASE}-api" --timeout=300s
