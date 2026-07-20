# CD notes

Promote images:

development → staging → production

```bash
# Tag immutable SHA then environment tag
docker tag unagency/platform:sha-abc123 unagency/platform:staging
helm upgrade --install unagency ./deployment/helm/unagency -n unagency --set image.tag=staging
```

Rollback: `deployment/rollback/rollback.sh`
