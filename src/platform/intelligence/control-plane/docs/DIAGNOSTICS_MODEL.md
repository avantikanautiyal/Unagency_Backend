# Diagnostics Model

## Overview

`PipelineDiagnostics` aggregates per-stage health, timing, and recommendations for every
control plane run.

## Schema

```typescript
interface PipelineDiagnostics {
  readonly diagnosticsId: string;
  readonly stageTimings: readonly StageTiming[];
  readonly stageResults: readonly StageDiagnostic[];
  readonly validationPassed: boolean;
  readonly recommendations: readonly string[];
  readonly explainabilityRefs: readonly string[];
}

interface StageTiming {
  readonly stage: PipelineStageKind;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly state: "completed" | "failed" | "skipped";
}

interface StageDiagnostic {
  readonly stage: PipelineStageKind;
  readonly success: boolean;
  readonly message: string;
  readonly warnings: readonly string[];
}
```

## Collection Points

| Stage | Diagnostic Message |
|-------|-------------------|
| task_intelligence | Task plan produced |
| agent_planning | Team plan produced |
| workflow_intelligence | Workflow plan produced |
| execution_governance | Governance evaluation complete |
| execution_intelligence | Execution strategy optimized |
| model_intelligence | Models ranked |
| negotiation | Provider negotiation complete |
| routing | Routing decision produced |

## Validation

`DefaultPipelineValidator` checks:

- All 8 artifact keys present in `ArtifactChain`
- Task plan ID matches agent planning input plan ID

## Warnings

Non-fatal conditions recorded in `recommendations`:

- Governance blocked execution (plan still produced for review)
- Missing artifact for any stage

## Location

Contracts: `contracts/diagnostics.ts`
Validator: `validation/pipeline-validator.ts`
Collection: `pipeline/pipeline-orchestrator.ts`
