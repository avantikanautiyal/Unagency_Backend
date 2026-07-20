#!/usr/bin/env bash
# Helm production deploy
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE="${RELEASE:-unagency}"
NS="${NAMESPACE:-unagency}"
helm upgrade --install "$RELEASE" "$ROOT/deployment/helm/unagency" \
  --namespace "$NS" --create-namespace \
  --values "$ROOT/deployment/helm/unagency/values.yaml" \
  "$@"
kubectl -n "$NS" rollout status "deploy/${RELEASE}-api" --timeout=300s
