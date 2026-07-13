# Provider Adapter Platform (M4.4)

The Provider Adapter Platform defines **how every external AI provider integrates
with UNAGENCY**. It is the framework only — it contains **no concrete providers**
(OpenAI, Anthropic, Gemini, …), **no networking**, and **no vendor SDKs**. Those
are M4.5.

```
NegotiatedExecution (M4.3)
        │
        ▼
Provider Adapter Platform  ──►  ProviderAdapterRequest ──► [wire payload]
        │                                                        │
        │                                        (future dispatch — M4.5)
        ▼                                                        ▼
ProviderExecutionResponse (M4.1)  ◄── ProviderAdapterResponse ◄── raw payload
```

## What a provider is

Every provider is described by a single canonical **`ProviderManifest`** (models,
capabilities, features, streaming profile, regions, rate limits, status,
maturity). The runtime and negotiation platforms consume manifests instead of
hardcoded provider metadata.

## Adding a new provider (M4.5)

A new provider is implementable in **three steps, with no changes to any other
platform module**:

1. **Create a `ProviderManifest`** (via `ProviderManifestBuilder`).
2. **Extend the matching abstract adapter** (`AbstractTextProviderAdapter`,
   `AbstractReasoningProviderAdapter`, `AbstractVisionProviderAdapter`,
   `AbstractImageProviderAdapter`, `AbstractAudioProviderAdapter`,
   `AbstractEmbeddingProviderAdapter`, `AbstractStreamingProviderAdapter`,
   `AbstractMultimodalProviderAdapter`) and implement only `translateRequest()`.
3. **Register the adapter** with the `IProviderAdapterRegistry`.

## Quick start

```ts
import {
  createAdapterPlatform,
  ProviderManifestBuilder,
  ProviderModelBuilder,
  AbstractTextProviderAdapter,
} from "./adapter-platform";

const manifest = new ProviderManifestBuilder()
  .withProviderId(asProviderId("acme"))
  .withVendor("acme")
  .withModels([new ProviderModelBuilder().withId("acme-1").asDefault().build()])
  .withDefaultModels({ text: "acme-1" })
  .build();

class AcmeAdapter extends AbstractTextProviderAdapter {
  translateRequest(request) {
    return success({ value: { model: request.modelId, ...request.input }, warnings: [], droppedFields: [] });
  }
}

const platform = createAdapterPlatform();
platform.registry.register(new AcmeAdapter(metadata, manifest));

const prepared = platform.engine.prepare({ negotiated, input });
// ...dispatch prepared.wirePayload in the runtime (M4.5)...
const response = platform.engine.finalize({ adapterId, request: prepared.value.adapterRequest, raw });
```

## Guarantees

- **Provider-independent:** the only provider-shaped data is an opaque
  `ProviderWirePayload` (a plain record) produced by `translateRequest`; no vendor
  type ever appears on a public contract.
- **Canonical everything:** finish reasons, token usage, safety markers, and
  errors are normalized into closed unions.
- **`Result<T>`** for all fallible operations; no throwing for expected failures.
- **Immutable contracts**, constructor injection, builder pattern throughout.
- **No persistence, no networking, no SDKs.**

> Import the platform from `providers/adapters/adapter-platform` (the module's
> `index.ts` is retained for the frozen M1 provider-architecture stub — see
> `docs/ARCHITECTURE_REVIEW.md` and ACP-A2).

See `docs/` for the full architecture review, models, implementation report,
future-extension report, and ACP report.
