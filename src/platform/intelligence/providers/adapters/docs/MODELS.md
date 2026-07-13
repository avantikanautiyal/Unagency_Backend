# M4.4 — Models & Diagrams

## 1. Manifest Model

```
ProviderManifest
├── providerId : ProviderId
├── vendor, displayName
├── version : ProviderManifestVersion { major, minor, patch, raw }
├── modalities : ProviderModality[]              (text|image|audio|video|embedding|structured|multimodal)
├── models : ProviderModel[]
│     ├── id, displayName, aliases, isDefault, deprecated
│     ├── modalities
│     └── capability : ProviderModelCapability
│           ├── streaming, toolCalling, vision, audio, embeddings
│           ├── reasoning, structuredOutputs, jsonMode
│           └── contextWindow?, maxInputTokens?, maxOutputTokens?
├── defaultModels : { modality → modelId }
├── capabilities : string[]
├── authenticationTypes : ProviderAuthenticationType[]
├── features : ProviderManifestFeatures (coarse union of model capabilities)
├── streaming : ProviderStreamingProfile { supported, chunkModes, heartbeat, endMarker }
├── rateLimits : ProviderRateLimitMetadata
├── supportedRegions : string[]
├── status : ProviderLifecycleState
├── maturity : ProviderMaturity
└── metadata, createdAt, updatedAt
```

**Projections** (`manifests/manifest-projection.ts`) let negotiation/runtime
consume manifests without hardcoding:

- `deriveCompatibilityProfile(manifest) → ProviderCompatibilityProfile`
- `deriveModelProfile(manifest, modelId) → ProviderModelProfile`
- `resolveDefaultModelId(manifest, modality)`

## 2. Adapter Hierarchy Diagram

```
IProviderAdapter (port)
        ▲
AbstractProviderAdapter                      (describe, validate, normalizeResponse,
        ▲                                     translateError, health; translateRequest abstract)
        ├── AbstractTextProviderAdapter
        ├── AbstractReasoningProviderAdapter
        ├── AbstractVisionProviderAdapter
        ├── AbstractImageProviderAdapter
        ├── AbstractAudioProviderAdapter
        ├── AbstractEmbeddingProviderAdapter
        ├── AbstractMultimodalProviderAdapter
        └── AbstractStreamingProviderAdapter  (+ openStream/normalizeChunk/heartbeat/closeStream)
                    ▲
              <ConcreteProvider> (M4.5 — implements translateRequest only)
```

## 3. Translation Pipeline

```
NegotiatedExecution ──IRequestTranslator──► ProviderAdapterRequest (canonical)
                                                    │
                                          adapter.validate()  ── Result<ProviderValidationResult>
                                                    │
                                     adapter.translateRequest() ─► ProviderWirePayload (opaque)
                                                    │
                                       [ network dispatch: M4.5 ]
                                                    ▼
raw provider payload ──adapter.normalizeResponse──► ProviderAdapterResponse (canonical)
                                                    │
                              IResponseTranslator ─► ProviderExecutionResponse (M4.1)
```

## 4. Response Normalization Model

`ProviderAdapterResponse` normalizes:

| Field | Canonicalized from | Result |
|-------|--------------------|--------|
| `finishReason` | `finish_reason` / `stop_reason` / `finishReason` | `CanonicalFinishReason` |
| `usage` | `prompt_tokens`/`input_tokens`, `completion_tokens`/`output_tokens`, `total_tokens`, `reasoning_tokens` | `ProviderTokenUsage` |
| `safety` | `safety` / `safetyRatings` | `ProviderSafetyMarker[]` |
| `reasoning` | `reasoning` | opaque record |
| `streaming` | `streaming` (when streamed) | `ProviderStreamingMetadata` |
| `latencyMs` | `latencyMs` / `latency_ms` (engine-injected hint) | number |
| `warnings` | derived | `ProviderDiagnostic[]` |

## 5. Error Normalization Model

`IProviderErrorTranslator.normalize(error)` → canonical `ProviderError`:

```
status/keyword ───────────────► CanonicalErrorKind        retryable
401 / "invalid api key"          authentication            no
403 / "forbidden"                authorization             no
429 / "rate limit"               rate_limit                YES
408 / "timeout"                  timeout                   YES
     "quota" / "billing"         quota                     no
     "content policy"/"safety"   content_policy            no
503/502 / "overloaded"           unavailable               YES
>=500 / "internal"               provider_internal         YES
(otherwise)                      unknown                   no
```

Idempotent: an already-canonical `ProviderError` passes through unchanged.

## 6. Lifecycle Model

```
registered ─► initializing ─► ready ⇄ degraded ⇄ maintenance
     │              │           │        │            │
     └──────────────┴───────────┴────────┴────────────┴─► disabled ─► retired (terminal)
                                                              │
                                                        initializing
```

`IAdapterLifecycleManager` guards transitions; illegal transitions return
`Result.failure(AdapterLifecycleError)`.

## 7. Registry Model

```
IProviderAdapterRegistry (owner)
├── register(adapter)        → validates + registers + lifecycle.register + emits event
├── resolve(adapterId)
├── resolveByProvider(id)
├── describe(adapterId)      → merges live lifecycle state
├── list()
├── remove(adapterId)
└── validate(adapter)
```

## 8. NegotiatedExecution → Adapter I/O Object Diagram

```
PrepareAdapterExecutionInput { negotiated, input, parameters?, modality?, timeoutMs? }
        │
        ▼
PreparedAdapterExecution
├── adapterRequest : ProviderAdapterRequest
├── wirePayload    : ProviderWirePayload (opaque)
└── warnings       : ProviderDiagnostic[]

NormalizeAdapterResponseInput { adapterId, request, raw, latencyMs? }
        │
        ▼
ProviderExecutionResponse (runtime M4.1)
```
