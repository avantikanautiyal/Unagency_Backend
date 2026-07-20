# Production Deployment — Architecture Review

## Verdict

Ops-only layer under `deployment/`. Deploys the **frozen V1.0** backend.
No Intelligence / Business / Provider / Persistence redesign.

## Topology

```
Internet → Nginx / Ingress (TLS, rate limit, streaming)
        → API / Business / Intelligence pods
        → Workers / Background
        → PostgreSQL · MongoDB · Redis (StatefulSets)
        → Migration Job (Persistence public API)
```

## Principle

Images share one artifact; `SERVICE_ROLE` selects process mode. Backend modules remain untouched.
