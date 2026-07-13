# Learning Intelligence Platform (M3.3)

## Purpose

Transform historical intelligence **artifacts** into explainable **learning recommendations**.

The Learning Platform **observes**, **analyzes**, and **recommends** — it never modifies platform behavior directly.

## Pipeline

```
Artifacts
  → Signal Extraction
  → Pattern Detection
  → Statistical Analysis
  → Recommendation Generation
  → Learning Signals
```

## Analyzers (placeholder)

Provider, Prompt, Brand, Human, Workflow, Cost, Latency, Quality, Evaluation, Knowledge, Memory, Routing

## Usage

```typescript
import {
  createLearningIntelligenceEngine,
  sampleLearningRequest,
} from "./platform/intelligence/learning";

const engine = createLearningIntelligenceEngine();
const result = await engine.learn(await sampleLearningRequest());

if (result.ok) {
  console.log(result.value.recommendations);
  console.log(result.value.summary.highlights);
}
```

## Boundaries / MUST NOT

- Modify modules automatically
- Train ML models or run online learning
- Import provider SDKs
- Connect to databases
- Modify frozen milestones

## Dependencies

`shared`, `artifacts`, `evaluation` contracts, `memory` contracts

No provider platform dependency.
