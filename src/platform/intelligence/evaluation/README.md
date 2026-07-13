# Intelligence Evaluation Platform (M3.1)

## Purpose

Evaluate execution outputs objectively and produce immutable evaluation artifacts.

This module does **not** execute AI, call providers, learn, or perform human review.

## Pipeline

```
ExecutionResult
  → Judge Pipeline
  → EvaluationReport
  → ConfidenceReport
  → ReviewDecision
```

## Judges (placeholder)

Instruction, Brand, Policy, Schema, Grammar, Safety, Factual, Hallucination, Human (signal only)

## Review Dispositions

`mandatory` | `recommended` | `optional` | `skip`

## Usage

```typescript
import {
  createIntelligenceEvaluationEngine,
  sampleEvaluationRequest,
} from "./platform/intelligence/evaluation";

const engine = createIntelligenceEvaluationEngine();
const result = await engine.evaluate(sampleEvaluationRequest());

if (result.ok) {
  console.log(result.value.report.summary.passed);
  console.log(result.value.confidence.confidenceLevel);
  console.log(result.value.review.disposition);
}
```

## Boundaries / MUST NOT

- Call providers or import SDKs
- Implement learning engine or human review UI
- Connect to databases
- Modify frozen milestones

## Dependencies

- `shared`
- `memory` contracts
- `execution-runtime` contracts
- `prompt-compiler` contracts

No provider platform dependency.
