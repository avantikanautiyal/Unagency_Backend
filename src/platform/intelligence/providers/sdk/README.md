# Provider SDK Platform (M4.6)

Isolates **all third-party SDKs** behind stable internal interfaces. The rest of
the Intelligence Operating System must never directly import OpenAI, Anthropic,
Gemini, Groq, DeepSeek, Mistral, OpenRouter, Together AI, Fireworks, Cohere, xAI,
or any future provider package.

> No SDK packages. No networking. No HTTP. No ProviderAdapters. Placeholder wrappers only.

## Architecture

```
Provider Adapter
  → Canonical Provider Request
    → Provider SDK Platform
      → SDK Wrapper (vendor-specific interface)
        → Transport Platform (future)
          → Provider
```

Adapters never know SDK details. Wrappers never expose vendor SDK objects.

## Quick start

```ts
import { createSdkPlatform, SdkRequestBuilder } from ".../providers/sdk";
import { asProviderId } from ".../shared/identifiers";

const { engine } = createSdkPlatform();

const request = SdkRequestBuilder.create()
  .withRequestId("req_1")
  .withProviderId(asProviderId("provider.acme"))
  .withVendor("openai")
  .withOperation("chat.completions")
  .withPayload({ model: "gpt-4", messages: [] })
  .build();

const result = await engine.execute(request);
// result.value.success, result.value.response?.payload, result.value.error
```

## Registered vendors (placeholders)

`openai`, `anthropic`, `gemini`, `groq`, `deepseek`, `mistral`, `openrouter`,
`together`, `fireworks`, `cohere`, `xai`

Each wrapper implements its specialized interface (`IOpenAISdk`, etc.) and returns
`NOT_IMPLEMENTED` until a future integration milestone wires real SDK logic via
the Transport Platform.

## Guarantees

- **Interfaces everywhere**, constructor injection, `Result<T>`, immutable contracts.
- **SdkRequest / SdkResponse** are the only data shapes crossing the SDK boundary.
- **One-class change rule**: integrating OpenAI means changing only `OpenAISdkWrapper`.
- **SDK-level retry/timeout** independent of Runtime and Transport retry.

See [`docs/`](./docs) for architecture review, diagrams, reports, and ACPs.
