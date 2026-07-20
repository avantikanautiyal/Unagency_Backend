# UNAGENCY Production Deployment & DevOps Platform

Deploy the **frozen V1.0** backend. No Intelligence / Business / Provider redesign.

## Quick start

```bash
# Development
bash deployment/scripts/deploy-dev.sh

# Production images + Helm
bash deployment/scripts/build-images.sh 1.0.0
bash deployment/scripts/deploy-helm.sh
```

## Layout

| Path | Purpose |
|------|---------|
| `docker/` | Production Dockerfiles |
| `docker-compose/` | Dev / staging / production stacks |
| `kubernetes/` | Manifests + overlays |
| `helm/unagency/` | Production Helm chart |
| `nginx/` | Reverse proxy configs |
| `ci/` · `cd/` | Pipelines & promotion notes |
| `scripts/` | Build, deploy, backup, migrate |
| `docs/` | Guides & ACP |
| `runbooks/` | Operational procedures |

## Docs

Architecture Review · Deployment · Docker · Kubernetes · Helm · CI/CD · Backup · Recovery · Security · Operations · Runbooks · Unit Tests · Deployment Validation · ACP Report — all under `docs/`.
