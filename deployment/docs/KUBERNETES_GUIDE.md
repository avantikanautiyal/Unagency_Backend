# Kubernetes Guide

Base manifests: `deployment/kubernetes/base/`

- Deployments (api, business, direct, worker, background)
- StatefulSets (postgres, mongodb, redis)
- Services, Ingress, Secrets, ConfigMaps
- PVC via volumeClaimTemplates
- HPA for api & worker
- Migration Job

Overlays: `overlays/{development,staging,production}`

```bash
kubectl apply -k deployment/kubernetes/overlays/production
```
