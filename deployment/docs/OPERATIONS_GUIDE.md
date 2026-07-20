# Operations Guide

| Task | Command / path |
|------|----------------|
| Dev up | `scripts/deploy-dev.sh` |
| Prod helm | `scripts/deploy-helm.sh` |
| Backup | `scripts/backup.sh` |
| Rollback | `rollback/rollback.sh` |
| Migrate | Compose `migrate` service / Helm hook / K8s Job |
| Monitor | `monitoring/README.md` (Observability wiring) |
| Release | `releases/1.0.0.yaml` |

Health: `/health` and `/v1/health` when API Gateway routes are mounted.
