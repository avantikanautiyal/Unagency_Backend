# Enterprise API Gateway — Architecture Review

## Verdict

Platform services under `src/platform/api/`. **Not** part of the Intelligence OS.
Sole external entry point for React Native, Web, Admin, Client/Team portals, SDKs,
and third-party integrations.

## Boundary

```
Frontends / SDKs
       ↓
 Enterprise API Gateway (only entry)
       ↓
 API Services (executions, catalog, tenants, auth, …)
       ↓
 Distributed Execution · Integration Layer · Catalog · Observability (public APIs)
```

Frontends never import Runtime, Routing, Negotiation, Model Intelligence, or Providers.

## Non-goals

No Intelligence OS redesign. No React Native / Web frontend work in this milestone.
No Express mount into legacy business routes required for platform completeness.
