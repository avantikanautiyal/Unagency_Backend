# Migration automation for deployment
# Executes SERVICE_ROLE=migration container / Job against Persistence engine.

default_environment: production
dialect: postgres
commands:
  compose: docker compose -f deployment/docker-compose/docker-compose.production.yml run --rm migrate
  kubernetes: kubectl -n unagency create job migrate-manual --from=job/migrations
  helm: helm upgrade --install unagency deployment/helm/unagency -n unagency
health:
  postgres: pg_isready
  after_migrate: curl -fsS https://api.unagency.io/health
