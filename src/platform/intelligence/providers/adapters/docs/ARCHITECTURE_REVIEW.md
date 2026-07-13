# M4.4 Provider Adapter Platform — Architecture Review

## 1. Mission & scope

The Provider Adapter Platform defines **how** external AI providers integrate
with UNAGENCY. It builds the **adapter framework only**:

- Canonical `ProviderManifest` describing every provider.
- `IProviderAdapter` port + reusable `Abstract*ProviderAdapter` base classes.
- Translation pipeline (`NegotiatedExecution → ProviderAdapterRequest → wire →
  ProviderAdapterResponse → ProviderExecutionResponse`).
- Response/error normalization into canonical shapes.
- Validation, diagnostics, lifecycle, streaming, and a registry that owns adapters.

**Out of scope (by design):** concrete providers (OpenAI/Anthropic/Gemini/…),
networking, provider SDKs, persistence, routing, execution.

## 2. Provider Adapter Architecture Diagram

```
                        ┌──────────────────────────────────────────────┐
                        │            Provider Adapter Platform           │
                        │                                                │
  NegotiatedExecution ──►  IRequestTranslator ─► ProviderAdapterRequest  │
      (M4.3)            │            │                    │              │
                        │            │              IProviderAdapter     │
                        │            │              .validate()          │
                        │            │              .translateRequest()  │
                        │            ▼                    │              │
                        │     IProviderAdapterRegistry    ▼              │
                        │     (owns adapters)      ProviderWirePayload ──┼─► [dispatch: M4.5]
                        │            ▲                                   │
                        │     IAdapterLifecycleManager                  │
                        │     IAdapterValidator / IProviderDiagnostics  │
                        │            │                                   │
   ProviderExecution    │   IResponseTranslator ◄─ IResponseNormalizer ◄┼── raw payload
   Response (M4.1) ◄─────┤                          IProviderErrorTranslator
                        │                          IStreamingAdapter    │
                        └──────────────────────────────────────────────┘
```

## 3. Design principles

| Principle | Application |
|-----------|-------------|
| **Ports & adapters** | Every subsystem is an interface in `interfaces/`; defaults are swappable. |
| **Provider independence** | Only an opaque `ProviderWirePayload` (plain record) carries provider-shaped data. No vendor type on any contract. |
| **Immutability** | All contracts are `readonly`; builders `Object.freeze` outputs. |
| **Result pattern** | Every fallible operation returns `Result<T>`; module faults use `IntelligenceError` subclasses; provider faults use canonical `ProviderError`. |
| **Constructor injection** | Engine, registry, adapters, diagnostics all take collaborators via constructor. |
| **Single ownership** | The registry is the sole owner of adapters + lifecycle. |
| **Canonicalization** | Finish reasons, usage, safety, and errors collapse to closed unions. |

## 4. Pipeline stages

1. **Resolve** — registry resolves the adapter for `negotiated.selectedProviderId`.
2. **Translate request** — `IRequestTranslator` builds a canonical
   `ProviderAdapterRequest` (model/modality/features/timeouts) from the
   `NegotiatedExecution`.
3. **Validate** — `adapter.validate()` checks model + feature + streaming
   compatibility against the manifest.
4. **Wire mapping** — `adapter.translateRequest()` produces the opaque
   `ProviderWirePayload` (the only provider-shaped artifact).
5. *(dispatch happens in a future milestone — no networking here.)*
6. **Normalize** — `adapter.normalizeResponse()` canonicalizes the raw payload
   into a `ProviderAdapterResponse`.
7. **Translate response** — `IResponseTranslator` maps to the frozen runtime
   `ProviderExecutionResponse` (M4.1), reporting fields the frozen contract
   cannot hold (see ACP-A1).

## 5. Dependency Graph

```
adapters/
  ├─ depends on ─► negotiation/contracts   (NegotiatedExecution, ExecutionProfile)
  ├─ depends on ─► runtime/contracts        (ProviderExecutionResponse, Retry/Timeout)
  ├─ depends on ─► shared                    (Result, IntelligenceError, identifiers)
  └─ depends on ─► events                    (optional EventBus publisher)

  NEVER depends on: provider SDKs, HTTP, MongoDB, Redis, BullMQ, business modules.
```

All dependencies point **inward / sideways to contracts only**. No frozen module
imports the adapter platform.

## 6. Relationship to the frozen M1 provider stub

M1 ("Provider Architecture — contracts only") already placed a minimal
`IProviderAdapter` (with `execute()`) and `PlaceholderProviderAdapter` directly in
`providers/adapters/`, consumed by the frozen `providers/factory` and
`providers/interfaces`. To honor the freeze:

- Those M1 files and the M1 `adapters/index.ts` barrel are **left untouched**.
- The M4.4 platform lives in **subfolders** and is exported from a dedicated
  entry, **`adapters/adapter-platform.ts`**, so its richer (colliding) contract
  names never break the frozen M1 barrel.

A future consolidation is proposed as **ACP-A2**.
