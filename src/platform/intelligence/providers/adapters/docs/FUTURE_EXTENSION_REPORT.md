# M4.4 — Future Extension Report

The Provider Adapter Platform is the extension seam for **all** future providers
and provider-facing features. Every extension below is additive — **no existing
module or contract changes**.

## 1. Concrete providers (M4.5)

Each provider ships as: a `ProviderManifest`, a subclass of the matching
`Abstract*ProviderAdapter` implementing `translateRequest()` (and, for streaming
providers, an optional custom `IStreamingAdapter`), and a registration call.
Networking/SDK usage is confined to the concrete adapter — never the framework.

- OpenAI / Anthropic / Gemini / Groq / DeepSeek / Mistral / OpenRouter →
  `AbstractTextProviderAdapter` / `AbstractReasoningProviderAdapter` /
  `AbstractMultimodalProviderAdapter`.
- ElevenLabs → `AbstractAudioProviderAdapter`.
- Runway / Stability AI → `AbstractImageProviderAdapter` (+ future video base).
- Embedding providers → `AbstractEmbeddingProviderAdapter`.

## 2. Runtime consumption of manifests

The runtime (M4.1) can replace hardcoded provider metadata with
`deriveCompatibilityProfile(manifest)` / `deriveModelProfile(...)`, and negotiation
(M4.3) can validate candidate providers/models directly against manifests. Both
are pure projections and require no adapter-platform changes.

## 3. New modalities & features

- New modality (e.g. `video`) → add a value to `ProviderModality` and a new
  `AbstractVideoProviderAdapter` base. Existing adapters unaffected.
- New canonical feature → add to `CANONICAL_FEATURES` and `capabilityFeatures`.
- New finish reason / error kind → extend the closed unions (additive).

## 4. Streaming evolution

`IStreamingAdapter` already models chunk normalization, heartbeats, and
end-of-stream markers. Backpressure and resumable streams can be added as
optional methods without breaking the port.

## 5. Diagnostics & lifecycle

- Fleet health aggregation over `IProviderDiagnostics.healthSummary`.
- Persistent lifecycle store implementing `IAdapterLifecycleManager` (the
  in-memory version is the default).
- Scheduled maintenance windows via lifecycle transitions.

## 6. Events & telemetry

`EventBusAdapterEventPublisher` already emits `adapter.registered` and
`adapter.lifecycle.*`. Per-stage pipeline events can be added behind the same
`IAdapterEventPublisher` port.

## 7. Registry backends

`InMemoryProviderAdapterRegistry` can be swapped for a persistent or distributed
registry by implementing `IProviderAdapterRegistry` — the engine depends only on
the interface.
