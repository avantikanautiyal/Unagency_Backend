# UNAGENCY Intelligence Platform — Knowledge Transfer

**Audience:** Engineers continuing development  
**Last updated:** July 2026  
**Canonical code:** `src/platform/intelligence/`  
**Specification:** `docs/specification/` (v1.0, M0–M3.4)

---

## 1. What This Is

We are building an **Intelligence Operating System (IOS)** — a provider-independent control plane that sits between business applications (Prakria Direct backend) and external AI providers. It governs capability planning, execution lifecycle, context/knowledge/prompt preparation, quality evaluation, artifact canonicalization, and learning signals.

**Key design goal:** Business code never talks to OpenAI/Anthropic/etc. directly. It calls `IIntelligenceGateway` only. Provider selection, negotiation, and execution are owned by dedicated platform modules with strict dependency boundaries.

**Current state:** M0–M3 are **complete and frozen** (contracts + in-memory implementations, no live AI calls). M4 (Provider Platform runtime) is **substantially scaffolded** — full module structure, engines, and **443 passing tests** — but vendor SDKs and real HTTP are still placeholders.

---

## 2. Repository Layout

```
unagency-backend/
├── src/                          # Main backend (Express, MongoDB, BullMQ, etc.)
│   └── platform/intelligence/    # ← ALL intelligence work lives here
├── docs/specification/           # Official architecture spec (22 docs + validation)
├── tests/platform/intelligence/  # Jest tests (101 suites)
└── platform/intelligence/        # Legacy stubs — ignore; use src/ path
```

The legacy `platform/intelligence/` at repo root is **not** canonical. Always work in `src/platform/intelligence/`.

---

## 3. Architecture Layers

```
Layer 0 — Foundation
  shared, config, events, security, telemetry, policies, runtime, scheduler

Layer 1 — Kernel
  lifecycle, DI (ServiceContainer), module registry, health, composition root

Layer 2 — Planning (Control Plane)
  capability-registry → capability-catalog
  providers (metadata, registry, factory, capability-matrix)
  execution-planning (CapabilityRequest → ExecutionPlan)

Layer 3 — Execution
  execution-runtime (sessions, state machine, snapshots)
  orchestrator (coordinates plans via runtime)
  gateway (sole public entry — IIntelligenceGateway)

Layer 4 — Intelligence Engines
  context, knowledge, prompt-compiler, memory

Layer 5 — Quality
  evaluation, artifacts, learning

Layer 6 — Provider Runtime (M4, in progress)
  providers/runtime, identity, negotiation, adapters, transport, sdk,
  integration, routing, execution-intelligence, execution-optimization
```

### End-to-end request flow (today)

```
Business Module
  → IIntelligenceGateway.invokeCapability()
    → Execution Planning Engine  (selects provider via catalog + matrix + policies)
      → ExecutionPlan
        → Intelligence Orchestrator
          → Execution Runtime
            → Mock capability output (echo, uppercase, summarize_mock, translate_mock)
              → GatewayCapabilityResponse
```

Future M4 flow (partially built, not wired end-to-end yet):

```
ExecutionPlan
  → Provider Routing (M4.8)           — score/rank/failover (no execution)
  → Provider Negotiation (M4.3)       — accept/reject before runtime
  → Provider Runtime (M4.1)           — sessions, retry, timeout, circuit breaker
    → Provider Adapter (M4.4)         — canonical request/response translation
      → Provider SDK (M4.6)           — vendor wrapper (placeholder)
        → Provider Transport (M4.5)   — HTTP/SDK/gRPC abstraction (placeholder)
          → External AI Provider
```

---

## 4. Module Inventory

| Module | Milestone | Status | Role |
|--------|-----------|--------|------|
| `shared` | M0 | ✅ Frozen | `Result<T>`, branded IDs, base errors |
| `kernel` | M0/M1 | ✅ Frozen | DI, lifecycle, registry, health, composition |
| `capability-registry` | M1.2 | ✅ Frozen | Source of truth for capability definitions |
| `capability-catalog` | M1.2 | ✅ Frozen | Read-only discovery over registry |
| `providers` (metadata) | M1.3 | ✅ Frozen | Provider registry, factory, matrix, health |
| `execution-planning` | M1.4 | ✅ Frozen | `CapabilityRequest → ExecutionPlan` |
| `execution-runtime` | M1.5 | ✅ Frozen | Session lifecycle, state machine, events |
| `orchestrator` | M1.6 | ✅ Frozen | Pipeline, hooks, middleware, failure handling |
| `gateway` | M1.7 | ✅ Frozen | Public API; `bootstrapIntelligenceGateway()` |
| `context` | M2.1 | ✅ Frozen | `IntelligenceContext` construction |
| `knowledge` | M2.2 | ✅ Frozen | Retrieval, ranking, filtering, snapshots |
| `prompt-compiler` | M2.3 | ✅ Frozen | Templates, AST, provider-independent compilation |
| `memory` | M2.4 | ✅ Frozen | Experience-layer memory records |
| `evaluation` | M3.1 | ✅ Frozen | Judges, confidence, review signals |
| `artifacts` | M3.2 | ✅ Frozen | Immutable canonical intelligence objects |
| `learning` | M3.3 | ✅ Frozen | Advisory recommendations from artifacts |
| `providers/runtime` | M4.1 | ✅ Built | Execution engine (no SDKs) |
| `providers/identity` | M4.2 | ✅ Built | Credentials, sessions, trust (in-memory) |
| `providers/negotiation` | M4.3 | ✅ Built | Pre-execution accept/reject decisions |
| `providers/adapters` | M4.4 | ✅ Built | Canonical adapter platform |
| `providers/transport` | M4.5 | ✅ Built | Transport pipeline (no real HTTP) |
| `providers/sdk` | M4.6 | ✅ Built | Vendor wrappers (all return NOT_IMPLEMENTED) |
| `providers/integration` | M4.7 | ✅ Built | Install/register/discover providers |
| `providers/routing` | M4.8 | ✅ Built | Scoring, ranking, failover strategies |
| `execution-intelligence` | M4.9 | ✅ Built | Pre-execution quality optimization |
| `execution-optimization` | M4.10 | ✅ Built | Historical advisory recommendations |

**Not started (spec only):** M5 Workflow, M6 Agent, M7 Human, M8 Plugin, M9 Governance, M10 Analytics.

---

## 5. Core Patterns (Must Follow)

### Result<T> — no throws for expected failures

```typescript
const result = await engine.negotiate(request);
if (result.ok) {
  // result.value
} else {
  // result.error (IntelligenceError)
}
```

Defined in `src/platform/intelligence/shared/result/result.ts`.

### Branded identifiers

Never use plain strings for domain IDs in public interfaces. Use `asProviderId()`, `asExecutionId()`, etc. from `shared/identifiers`.

### Module structure

Every module exposes:
- `interfaces/` — ports (DI)
- `contracts/` — immutable request/response shapes
- `factories/` — `create*Platform()` composition helpers
- `builders/` — fluent immutable builders
- `index.ts` — public surface only
- `README.md` — purpose + boundaries

### Dependency rules (non-negotiable)

| Rule | Detail |
|------|--------|
| Business → Gateway only | No direct imports of planner, orchestrator, providers |
| Provider selection | Only `execution-planning` decides provider |
| No SDKs in frozen modules | OpenAI/Anthropic packages isolated to future wrapper impl |
| No `process.env` | Except in `config` module |
| Composition root only | `kernel/composition` and `gateway/factories` wire concrete classes |
| Frozen = no edits | M0–M3 modules require an Architecture Change Proposal (ACP) |

Full rules: `src/platform/intelligence/docs/engineering/dependency-rules.md`

---

## 6. Key Entry Points

### Bootstrap the platform

```typescript
import {
  bootstrapIntelligenceGateway,
  shutdownIntelligenceGateway,
} from "./src/platform/intelligence/gateway";

const platform = await bootstrapIntelligenceGateway();
const result = await platform.gateway.invokeCapability({
  capabilityId: "echo",
  organizationId: "org_1",
  workspaceId: "ws_1",
  input: { message: "Hello" },
});
await shutdownIntelligenceGateway();
```

### Create artifacts

```typescript
import { createArtifactEngine, ArtifactInputBuilder } from "./src/platform/intelligence/artifacts";
const engine = createArtifactEngine();
const result = await engine.create(ArtifactInputBuilder.create()...build());
```

### Provider negotiation (M4)

```typescript
import { createNegotiationEngine } from "./src/platform/intelligence/providers/negotiation";
// Requires: capabilityRegistry, providerRegistry, capabilityMatrix
const result = await engine.negotiate(request);
// accepted | accepted_with_warnings | rejected
```

Each module's `README.md` has a "Quick start" section.

---

## 7. Testing

```bash
npx jest tests/platform/intelligence
# 101 suites, 443 tests — all passing
```

Tests mirror module structure under `tests/platform/intelligence/`. Config: `jest.config.js` (ts-jest, roots = `tests/`).

Patterns:
- Contract tests validate shape/behavior of public interfaces
- In-memory implementations for all persistence (no MongoDB/Redis in intelligence layer yet)
- `testing/` folders inside modules provide fixtures (`sample*Request`, `make*Candidates`)

---

## 8. Documentation Map

| Need | Location |
|------|----------|
| Full architecture spec | `docs/specification/README.md` |
| Intelligence lifecycle | `docs/specification/04-INTELLIGENCE_PIPELINE.md` |
| Dependency rules | `docs/specification/03-DEPENDENCY_RULES.md` |
| Roadmap / what's next | `docs/specification/20-ROADMAP.md` |
| Coding standards | `src/platform/intelligence/docs/engineering/coding-standards.md` |
| Module guidelines | `src/platform/intelligence/docs/engineering/module-guidelines.md` |
| Per-module deep dive | `<module>/README.md` and `<module>/docs/` |
| ACP reports (M4) | e.g. `providers/sdk/docs/ACP_REPORT.md` |

**Reading order for new engineers:**
1. This document
2. `docs/specification/01-SYSTEM_OVERVIEW.md` → `02-ARCHITECTURE.md` → `03-DEPENDENCY_RULES.md`
3. `src/platform/intelligence/README.md`
4. Module README for the area you'll work on

---

## 9. What's Placeholder vs Real

| Area | Real today | Placeholder / deferred |
|------|------------|------------------------|
| Planning & orchestration | Full in-memory engines | — |
| Gateway mock capabilities | echo, uppercase, summarize_mock, translate_mock | Live AI output |
| Provider SDK wrappers | Interface + registry + retry/timeout | Actual vendor API calls |
| Transport | Pipeline, serialization, middleware | HTTP/gRPC/WebSocket clients |
| Identity vault | In-memory credential store | AWS Secrets Manager / HashiCorp |
| Persistence | In-memory stores everywhere | MongoDB, Redis, S3, BullMQ |
| Business integration | Not wired to Express routes yet | `src/controllers/` adoption via gateway |

---

## 10. Open ACPs (Non-Blocking, for Awareness)

These are documented improvements — not blockers:

- **ACP-A1:** Enrich `ProviderExecutionResponse` with finish reason, latency, safety fields
- **ACP-A2:** Consolidate M1 placeholder adapter with M4.4 adapter platform
- **ACP-N1:** Typed model capability contract in capability-matrix
- **ACP-S1:** Shared bridge between `SdkRequest` and `CanonicalProviderRequest`
- **ACP-S2:** Unified error taxonomy across SDK / Transport / Adapter

See respective `docs/ACP_REPORT.md` files under each M4 module.

---

## 11. Recommended Next Work

Priority order for continuing development:

1. **Wire first real provider** — Implement one `*SdkWrapper` (e.g. OpenAI) + transport HTTP client; change only the wrapper class (one-class rule)
2. **End-to-end gateway path** — Connect negotiation → runtime → adapter → SDK → transport for a single capability
3. **Business module adoption** — Expose `IIntelligenceGateway` from Express controllers (no direct intelligence internals)
4. **Persistence adapters** — MongoDB/Redis behind existing store interfaces (artifacts, execution metadata)
5. **Scheduler** — BullMQ adapter behind `scheduler` contracts

Do **not** modify frozen M0–M3 modules without an ACP. Add new code in M4+ or via additive contracts.

---

## 12. Local Setup

```bash
npm install
npx jest tests/platform/intelligence    # verify platform tests
npm run dev                             # starts main Express backend (separate from intelligence tests)
```

TypeScript compiles via `tsc` (`npm run build`). Intelligence modules use relative imports within `src/platform/intelligence/` — no path aliases configured in `tsconfig.json`.

---

## 13. Glossary (Quick Reference)

| Term | Meaning |
|------|---------|
| **Capability** | A registered intelligence function (e.g. `echo`, future `summarize`) |
| **ExecutionPlan** | Provider-independent plan produced by execution-planning |
| **NegotiatedExecution** | Final go/no-go decision before provider runtime |
| **Artifact** | Immutable canonical record of an intelligence object (context, prompt, execution, etc.) |
| **ACP** | Architecture Change Proposal — required to modify frozen modules |
| **Composition root** | Only place that instantiates and wires concrete implementations |

Full glossary: `docs/specification/21-GLOSSARY.md`

---

## 14. Contacts & Conventions

- **Import style:** `import type` for types; export only through `index.ts`
- **Errors:** Extend `IntelligenceError` with `code`, `message`, `metadata`, `timestamp`
- **Immutability:** All public contracts use `readonly` fields; builders freeze output
- **PR discipline:** Run `npx jest tests/platform/intelligence` before submitting; respect dependency validation in `src/platform/intelligence/docs/DEPENDENCY_VALIDATION.md`
