# Pipeline Simulation Model

## Overview

Dry-run mode runs the full planning pipeline without provider execution. Activated via
`ControlPlaneRequest.mode = "simulate"`.

## Schema

```typescript
interface PipelineSimulationReport {
  readonly reportId: string;
  readonly mode: "dry_run";
  readonly stagesSimulated: readonly PipelineStageKind[];
  readonly planningState: PlanningState;
  readonly estimatedDurationMs: number;
  readonly providerExecution: false;
  readonly rationale: string;
}

interface PlanningState {
  readonly currentStage: PipelineStateKind;
  readonly stagesCompleted: readonly PipelineStageKind[];
  readonly totalDurationMs: number;
}
```

## Behavior

1. `engine.plan({ ...request, mode: "simulate" })` runs full pipeline
2. `DefaultPipelineSimulator` produces report from execution statistics
3. `providerExecution` is always `false`
4. All 8 stages listed in `stagesSimulated`

## API

```typescript
// Via plan with simulate mode
const result = await engine.plan({ ...request, mode: "simulate" });
result.value.simulation; // PipelineSimulationReport

// Dedicated simulate API
const sim = await engine.simulate(request);
```

## Guarantees

- No networking
- No SDK calls
- No provider runtime invocation
- Identical artifact chain to normal `plan()` mode

## Location

Contract: `contracts/simulation.ts`
Implementation: `simulation/pipeline-simulator.ts`
