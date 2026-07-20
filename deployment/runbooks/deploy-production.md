# Deploy UNAGENCY (Kubernetes + Helm)

1. Create secrets (never commit production values).
2. `bash deployment/scripts/deploy-helm.sh`
3. `kubectl -n unagency get pods`
4. Smoke: `curl -fsS https://api.unagency.io/health`
