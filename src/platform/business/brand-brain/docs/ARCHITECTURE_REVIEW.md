# Brand Brain — Architecture Review

## Verdict

Brand Brain is a **proprietary organizational intelligence layer** under the
Business Platform. It sits **above** the Intelligence Operating System and
**beside** SaaS domain state. It does **not** execute AI and does **not**
redesign the OS, Gateway, Persistence, or Deployment platforms.

## Placement

```
Frontends (future)
        ↓
Enterprise API Gateway
        ↓
Business Platform  ── Brand Brain enrich() ──► structured metadata
        ↓
Intelligence OS (frozen V1.0)
```

Enrichment happens **before** an execution request enters the Intelligence OS.
The only integration surface is structured execution metadata (via
`GatewayExecutionClient` optional `metadata`).

## Design principles

1. **Structured facts only** — never inject raw knowledge documents.
2. **No prompt fabrication** — never render or generate prompts inside Brand Brain.
3. **Per-organization uniqueness** — same business ask → different enrichment.
4. **Version everything** — every upsert is a new version; rollback creates a new tip.
5. **Explain every selection** — confidence, relevance, why-selected.

## Non-goals

- Intelligence OS / provider / runtime redesign
- Document RAG pipelines or embedding stores in this milestone
- Frontend / admin UI
- Payment or billing changes
