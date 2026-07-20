# ExecutionReadyPlan Model

## Overview

`ExecutionReadyPlan` is the final output of the Intelligence Control Plane. It aggregates
every stage artifact into one immutable, execution-ready contract.

## Schema

```typescript
interface ExecutionReadyPlan {
  readonly planId: ExecutionReadyPlanId;
  readonly requestId: string;
  readonly structuredTaskPlan: StructuredTaskPlan;
  readonly executionTeamPlan: ExecutionTeamPlan;
  readonly workflowExecutionPlan: WorkflowExecutionPlan;
  readonly governanceExecutionPlan: GovernanceExecutionPlan;
  readonly executionIntelligenceResult: ExecutionIntelligenceResult;
  readonly rankedModelCandidates: RankedModelCandidates;
  readonly negotiationResult: NegotiationResult;
  readonly routingDecision: RoutingDecision;
  readonly executionConstraints: readonly string[];
  readonly diagnostics: PipelineDiagnostics;
  readonly explanation: UnifiedExplanation;
  readonly artifacts: ArtifactChain;
  readonly authorized: boolean;
  readonly version: string;
  readonly createdAt: string;
}
```

## Field Semantics

| Field | Origin Stage |
|-------|-------------|
| structuredTaskPlan | Task Intelligence |
| executionTeamPlan | Agent Planning |
| workflowExecutionPlan | Workflow Intelligence |
| governanceExecutionPlan | Execution Governance |
| executionIntelligenceResult | Execution Intelligence |
| rankedModelCandidates | Model Intelligence |
| negotiationResult | Provider Negotiation |
| routingDecision | Provider Routing |
| executionConstraints | Governance decision conditions |
| authorized | Governance authorization flag |

## Authorization

`authorized` reflects `governanceExecutionPlan.authorization.authorized`.
Product launch scenarios may yield `pending_approval` with `authorized: false` while still
producing a complete plan for human review.

## Version

`version` = `CONTROL_PLANE_VERSION` (`1.0.0`)

## Location

Contract: `contracts/plan.ts`
Assembly: `pipeline/pipeline-orchestrator.ts`
