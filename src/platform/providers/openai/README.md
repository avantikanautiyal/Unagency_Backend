# OpenAI Provider — Reference Implementation

The first real provider integration for UNAGENCY. Every future provider must require only:

1. Provider Manifest (from discovery)
2. SDK Wrapper
3. Authentication
4. Request Mapper
5. Response Mapper

…plus a **Model Resolver** that maps capability profiles to the best currently available vendor model.

## Architecture

```
Desired Capability Profile
        ↓
OpenAI Model Resolver
        ↓
Discovered Inventory (cached)
        ↓
Adapter.translateRequest → OpenAI wire
        ↓
SDK Client → Transport (fetch | simulated)
        ↓
Adapter.normalizeResponse → Canonical
        ↓
Runtime Dispatcher → Execution Artifacts
```

The Intelligence OS **never** asks for `gpt-4` or `gpt-5`. It asks for capabilities; the OpenAI Model Resolver selects the best live model.

## Usage

```typescript
import { createOpenAIProvider } from "./index";

// Simulated (unit tests / CI — no network)
const result = await createOpenAIProvider({ mode: "simulated" });

// Live
const live = await createOpenAIProvider({
  mode: "live",
  auth: {
    apiKey: process.env.OPENAI_API_KEY!,
    organizationId: process.env.OPENAI_ORG_ID,
    projectId: process.env.OPENAI_PROJECT_ID,
  },
});

if (live.ok) {
  const model = live.value.resolveModel({
    modality: "text",
    requireToolCalling: true,
    maxCostPreference: "balanced",
  });
  await live.value.runtime.execute(request); // modelId optional
}
```

## Certification Gate

`createOpenAIProvider` runs the Provider Certification Framework before marking status `active`. Failure → status remains `experimental`.

## Layout

| Path | Responsibility |
|------|----------------|
| `discovery/` | Dynamic `/v1/models` discovery + cache |
| `models/` | Model Resolver + manifest projection |
| `adapters/` | Canonical ↔ OpenAI wire |
| `sdk/` | `IOpenAISdk` + HTTP/simulated clients |
| `dispatcher/` | Runtime dispatcher + artifacts/metrics |
| `authentication/` | API key / org / project / quota metadata |
| `factories/` | Compose Adapter + Runtime + Certification |

Frozen modules are **not** modified. The frozen `sdk/openai` placeholder remains untouched; this leaf supplies the real client.

See `docs/` for architecture review and ACP report.
