# Disaster Recovery

## RPO / RTO targets (defaults)

| Tier | RPO | RTO |
|------|-----|-----|
| Dev | best-effort | best-effort |
| Staging | 24h | 4h |
| Production | 1h | 1h |

## Failover

1. Promote standby Postgres (external managed HA recommended).
2. Point `DATABASE_URL` secret to promoted primary.
3. Helm upgrade / rollout restart API+workers.
4. Validate `/health` and execute smoke tests.

## Runbooks

See `deployment/runbooks/`.
