# Dependency Graph — Dynamic Evaluation

```
dynamic-evaluation
  ├── reuses IntelligenceEvaluationEngine + JudgePipeline + WeightedScoreAggregator
  ├── reuses core judges via registry (no duplication)
  ├── optional input types (read-only):
  │     capability-intelligence, task/workflow/governance plans,
  │     experience-injection, knowledge, context, model-intelligence,
  │     routing, consensus, provider-mesh
  └── emits signals for Learning / Experience (no ownership transfer)
```
