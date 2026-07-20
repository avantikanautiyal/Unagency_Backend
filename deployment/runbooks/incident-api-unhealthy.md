# Incident: API unhealthy

1. `kubectl -n unagency get pods`
2. `kubectl -n unagency logs deploy/unagency-api --tail=200`
3. Check Postgres/Redis/Mongo readiness.
4. If bad release: run rollback runbook.
5. Page on-call; attach Observability export if available.
