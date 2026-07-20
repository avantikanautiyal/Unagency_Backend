# Architecture Review — Dynamic Adaptive Evaluation

## Verdict

**Approved** as additive extensions to the Evaluation Platform.

## Principles

| Rule | Status |
|------|--------|
| Existing Evaluation Engine preserved | PASS |
| Existing judges reused (not duplicated) | PASS — registered as plugins |
| Strategy-driven pipelines | PASS |
| No new OS / orchestration | PASS |
| No networking / SDKs | PASS |

## Flow

Execution → Strategy Resolver → Judge Selection → Weighting → Evidence →
Dynamic Rubric → **IntelligenceEvaluationEngine** (reuse) → Report →
Learning Signals + Experience Candidates

## Risk

New judge plugins use placeholder heuristics; production LLM/specialist judges
plug into `IJudge` without changing the resolver.
