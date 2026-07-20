# Deployment Validation

Automated inventory checks ensure a customer can discover all required deploy artifacts.

Manual validation:

1. `docker compose -f deployment/docker-compose/docker-compose.development.yml config`
2. `helm lint deployment/helm/unagency`
3. `kubectl kustomize deployment/kubernetes/overlays/production`
