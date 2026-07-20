# Implementation Report — Dynamic Adaptive Evaluation

## Additive deliveries

| Area | Path |
|------|------|
| Contracts | `contracts/dynamic-evaluation.ts` + extended `JudgeKind` |
| Strategy resolver | `strategy-resolver/` |
| Judge registry + plugins | `judge-registry/` |
| Selection / weighting | `judge-selection/`, `weighting/` |
| Evidence / benchmarks | `evidence/`, `benchmarks/` |
| Adaptive thresholds | `adaptive/` |
| Explainability / learning signals | `explainability/`, `feedback/` |
| Profiles | `capability-profiles/`, `industry-profiles/` |
| Engine | `engine/dynamic-evaluation-engine.ts` |
| Factory | `factories/create-dynamic-evaluation-engine.ts` |

## Unchanged

`IntelligenceEvaluationEngine`, default judge pipeline factory, core judge
implementations, static evaluation tests.
