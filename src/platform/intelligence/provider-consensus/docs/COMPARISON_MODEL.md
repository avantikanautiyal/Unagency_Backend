# Comparison Model

Dimensions: quality, cost, latency, structure, reasoning, brand, safety,
compliance, evidence, confidence.

Weighted into `overallScore` and ranked. Strategy engines may override using a
single dimension (e.g. `best_quality`, `lowest_cost`).

## Location

`comparison/comparison-engine.ts`, `contracts/comparison.ts`
