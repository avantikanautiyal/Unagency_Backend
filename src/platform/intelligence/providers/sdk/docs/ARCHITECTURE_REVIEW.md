# M4.6 Provider SDK Platform — Architecture Review

## 1. Mission

Isolate **all third-party SDKs** behind stable internal interfaces so the rest of
the Intelligence Operating System never imports vendor packages directly. This
milestone creates **SDK wrappers only** — not ProviderAdapters.

**Not in scope:** SDK package installation, networking, HTTP, real authentication,
concrete provider integrations, or adapter logic.

## 2. Position in the provider stack

```
Adapter (M4.4)  →  SdkRequest  →  SDK Platform (M4.6)  →  SDK Wrapper
                                        ↓ (future)
                                  Transport (M4.5)  →  Provider wire
```

The adapter produces an opaque `ProviderWirePayload` wrapped in `SdkRequest`.
The SDK wrapper is the **only** place a future `openai` / `@anthropic-ai/sdk` /
`@google/generative-ai` package may be referenced — and only in a future milestone.

## 3. Architecture diagram

```
                         ┌───────────────────────────────────────────┐
 SdkRequest              │            ProviderSdkEngine               │
────────────────────────▶│  validate → resolve → retry/timeout →    │
                         │  normalize → SdkExecutionResult            │
                         └───────────────────┬───────────────────────┘
                                             │
                         ┌───────────────────▼───────────────────────┐
                         │              ISdkRegistry                  │
                         │  register / resolve / describe / validate  │
                         └───┬───────────────┬───────────────┬────────┘
                             │               │               │
              IOpenAISdk  IAnthropicSdk  IGeminiSdk  …  IXaiSdk
                             │               │               │
                    AbstractProviderSdkClient (placeholder)
                             │
                    NOT_IMPLEMENTED (this milestone)
                             │
                    (future) Transport Platform
```

## 4. Design principles

| Principle | How it is applied |
|-----------|-------------------|
| SDK isolation | No vendor package imports anywhere in the platform. |
| One-class change | Integrating OpenAI = change `OpenAISdkWrapper` only. |
| Interface segregation | Each vendor has its own specialized interface. |
| Opaque boundary | Only `SdkRequest` / `SdkResponse` cross the SDK seam. |
| Layered retry/timeout | SDK retry/timeout independent of Runtime and Transport. |
| Immutability + Result | All contracts `readonly`; fallible ops return `Result<T>`. |

## 5. Dependency graph

```
sdk
 ├─▶ shared                 (Result, errors, identifiers)
 ├─▶ events                 (optional event publisher)
 ├─▶ adapters/contracts    (ProviderWirePayload only)
 └─▶ transport/contracts    (future bridge; no import of transport engine)

sdk ⇏ openai / anthropic / @google/generative-ai / groq-sdk / …
sdk ⇏ Gateway / Planning / Knowledge / Memory / Evaluation / Learning / business
```

## 6. Placeholder strategy

Every vendor wrapper extends `AbstractProviderSdkClient`, implements its
specialized interface, and returns `NOT_IMPLEMENTED` for `execute()`, `stream()`,
and `authenticate()`. `describe()` and `health()` return valid metadata so the
registry, diagnostics, and negotiation layers can reason about capabilities today.
