# Explainability Model

## Overview

`UnifiedExplanation` consolidates rationale from all 8 intelligence stages into one report.

## Schema

```typescript
interface UnifiedExplanation {
  readonly summary: string;
  readonly taskRationale: string;
  readonly agentRationale: string;
  readonly workflowRationale: string;
  readonly governanceRationale: string;
  readonly executionStrategyRationale: string;
  readonly modelRecommendationRationale: string;
  readonly negotiationRationale: string;
  readonly routingRationale: string;
  readonly stageSummaries: Readonly<Record<PipelineStageKind, string>>;
}
```

## Source Mapping

| Field | Source Module | Source Field |
|-------|---------------|--------------|
| taskRationale | Task Intelligence | `explanation.classificationRationale` |
| agentRationale | Agent Planning | `explanation.roleSelectionRationale` |
| workflowRationale | Workflow Intelligence | `explanation.stageRationale` |
| governanceRationale | Execution Governance | `explanation.approvalRationale` or `blockRationale` |
| executionStrategyRationale | Execution Intelligence | strategy + mode kinds |
| modelRecommendationRationale | Model Intelligence | primary candidate `explanation.summary` |
| negotiationRationale | Negotiation | `summary` |
| routingRationale | Routing | primary provider + strategy |

## Stage Summaries

Per-stage one-liners in `stageSummaries`:

- `task_intelligence` — decomposition rationale
- `agent_planning` — coordination rationale
- `workflow_intelligence` — parallel execution rationale
- `execution_governance` — approval or block rationale
- `execution_intelligence` — optimization report summary
- `model_intelligence` — why primary model ranked first
- `negotiation` — negotiation decision enum
- `routing` — primary route reason

## API

```typescript
const explained = await engine.explain(request);
// explained.value: UnifiedExplanation
```

## Location

Contract: `contracts/explainability.ts`
Builder: `pipeline/pipeline-orchestrator.ts` → `buildUnifiedExplanation()`
