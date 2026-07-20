# Production Execution Validation Framework

Proves that the Intelligence Operating System behaves correctly under real
OpenAI provider execution. This is **not** a new Intelligence platform — it only
consumes public interfaces.

## Pipeline

```
Business Scenario
  → Integration Layer (full OS)
  → OpenAI Provider (dispatcher; no ControllableDispatcher bypass)
  → Validation checks
  → Benchmarks
  → Certification + Readiness Score
  → Production Validation Report
```

## Usage

```ts
import { createProductionValidationPlatform } from "./index";

// Live (requires OPENAI_API_KEY) — credentials registered via Identity Platform
const live = createProductionValidationPlatform({ mode: "live" });
const report = await live.engine.validate({
  requestId: "prod_1",
  scenarioId: "scn_retail",
});

// Tests / CI: openai_simulated still uses the real OpenAI leaf (simulated transport)
```

## Modes

| Mode | Behavior |
|------|----------|
| `live` | Real OpenAI HTTP via `FetchOpenAIHttpClient`; Identity registers API key |
| `openai_simulated` | Real OpenAI leaf + Simulated HTTP (no network) |

Never uses ControllableDispatcher. Runtime / Routing / Negotiation are unchanged.

## Scenarios

17 deterministic scenarios across marketing, software, research, image, video,
audio, translation, support, sales, legal, healthcare, education, retail,
hospitality, manufacturing, finance, HR.

See `docs/` for Architecture Review, ACP, and certification reports.
