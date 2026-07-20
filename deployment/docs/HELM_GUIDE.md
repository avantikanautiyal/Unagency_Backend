# Helm Guide

Chart: `deployment/helm/unagency`

```bash
helm upgrade --install unagency deployment/helm/unagency \
  -n unagency --create-namespace \
  --set image.tag=1.0.0
```

Pre-install/upgrade hook runs migrations. Values control replicas, HPA, ingress host, resources.
