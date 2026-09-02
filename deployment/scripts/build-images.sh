#!/usr/bin/env bash
# Build all UNAGENCY service images from the frozen V1.0 backend.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="${1:-1.0.0}"
IMAGE="${IMAGE_NAME:-unagency/platform}"

docker build -f "$ROOT/deployment/docker/Dockerfile" -t "$IMAGE:$TAG" -t "$IMAGE:latest" "$ROOT"
for role in api business direct worker background migration; do
  dockerfile="$ROOT/deployment/docker/Dockerfile.$role"
  if [[ -f "$dockerfile" ]]; then
    docker build -f "$dockerfile" --build-arg BASE_IMAGE="$IMAGE:$TAG" -t "$IMAGE-$role:$TAG" "$ROOT" || \
      docker tag "$IMAGE:$TAG" "$IMAGE-$role:$TAG"
  fi
done
echo "Built $IMAGE:$TAG and role tags"
