# Execution Optimization & Self-Improvement Platform (M4.10)

Learns from historical executions and generates **advisory** optimization
recommendations. Never executes providers, mutates heuristics, or changes prompts.

## Pipeline

```
Historical inputs → feedback analysis → domain learners → prioritize
  → score → confidence → benchmark → simulate → ExecutionOptimizationResult
```

## Quick start

```ts
import { createExecutionOptimizationPlatform } from ".../execution-optimization";
import { sampleExecutionOptimizationRequest } from ".../execution-optimization/testing";

const { engine } = createExecutionOptimizationPlatform();
const request = await sampleExecutionOptimizationRequest();
const result = await engine.optimize(request);
// result.value.recommendations — advisory only
```

See [`docs/`](./docs) for architecture review, models, and ACPs.
