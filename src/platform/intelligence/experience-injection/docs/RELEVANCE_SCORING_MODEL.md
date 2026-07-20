# Relevance Scoring Model

## RelevanceScore

| Factor | Weight | Source |
|--------|--------|--------|
| Exact match | 25% | capability, department, task, workflow, provider, model |
| Applicability | 15% | ExperienceScores.applicabilityScore |
| Confidence | 20% | Experience.confidence |
| Success rate | 10% | successCount / (success+failure) |
| Recency | 5% | age vs now |
| Frequency | 5% | usageCount |
| Improvement | 10% | averageImprovement |
| Evidence | 5% | evidenceScore |
| Semantic (placeholder) | 5% | Jaccard token overlap |

## Match Kinds

`exact` | `partial` | `semantic_placeholder` | `none`

## Location

`contracts/scoring.ts`, `relevance/similarity-engine.ts`
