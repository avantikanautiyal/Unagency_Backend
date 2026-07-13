# Execution Intelligence Platform (M4.9)

Maximizes output quality **before** any provider executes. Never calls providers,
SDKs, or routing engines — only prepares an optimized execution plan.

## Pipeline

```
ExecutionIntelligenceRequest → heuristics → strategy/mode → context/knowledge/prompt optimization
  → token budget → compression → reasoning → decomposition → quality prediction
  → risk analysis → verification plan → provider hints → ExecutionIntelligenceResult
```

## Quick start

```ts
import {
  createExecutionIntelligencePlatform,
  ExecutionIntelligenceRequestBuilder,
} from ".../execution-intelligence";
import { sampleExecutionIntelligenceRequest } from ".../execution-intelligence/testing";

const { engine } = createExecutionIntelligencePlatform();
const request = await sampleExecutionIntelligenceRequest();
const result = await engine.optimize(request);
// result.value.strategy, result.value.budget, result.value.providerHints
```

See [`docs/`](./docs) for architecture review, models, and ACPs.
