# Dynamic Evaluation Strategy Model

`DynamicEvaluationStrategy` captures:

- objective, pipeline family (marketing/software/healthcare/…)
- capability, industry, workflow type, output type
- risk + compliance levels
- human approval requirement
- historical success + experience signal counts
- benchmark profile id + rationale

Resolved by `DefaultEvaluationStrategyResolver` from capability/industry profiles
and content heuristics.
