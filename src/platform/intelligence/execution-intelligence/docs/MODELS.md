# M4.9 Execution Intelligence — Models & Diagrams

## Optimization Pipeline

1. Validate request
2. Evaluate heuristics (complexity, ambiguity, knowledge density, etc.)
3. Select strategy and mode
4. Optimize context, knowledge, prompt
5. Estimate token budget and compression plan
6. Plan reasoning and decomposition
7. Predict quality; analyze risks
8. Plan verification steps
9. Produce provider adaptation hints
10. Emit `ExecutionIntelligenceResult`

## Strategy Selection Model

| Input signal | Strategy bias |
|--------------|---------------|
| High ambiguity | `self_verification` |
| High complexity | `reasoning_first` |
| High knowledge density | `research_first` |
| Moderate score | `generate_review_improve` / `multi_pass` |
| Low score | `single_pass` |
| User preference | explicit override |

## Context Optimization Model

Optimize size, relevance, ordering, deduplication, priority, freshness.

## Knowledge Optimization Model

Rank chunks, compress, remove redundancy, enforce knowledge budget.

## Token Budget Model

| Field | Description |
|-------|-------------|
| promptTokens | Compiled prompt estimate |
| knowledgeTokens | Selected knowledge budget |
| reasoningBudget | Strategy-dependent |
| responseBudget | Output reserve |
| reserveBudget | Safety margin |
| compressionRatio | Applied when over maximum |

## Provider Adaptation Model

Hints only: formatting, reasoning style, structured output, streaming, context preference.

## Quality Prediction Model

Estimates expected quality, hallucination risk, completeness, confidence, need for reasoning/verification.

## Risk Analysis Model

Detects prompt ambiguity, missing context, knowledge gaps, conflicting instructions, token overflow, policy risks.

## Verification Planning Model

Recommends self-review, schema validation, fact verification, human review, second-pass refinement.

## Dependency Graph

```
ExecutionIntelligenceEngine
  → Context contracts
  → Knowledge contracts
  → Prompt Compiler contracts
  → Shared (Result, IDs, errors)
  ⇏ Provider Runtime / SDK / Transport / Adapters
```
