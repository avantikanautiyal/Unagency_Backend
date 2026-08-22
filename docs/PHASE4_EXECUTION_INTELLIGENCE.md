# Phase 4 — Execution Intelligence

## Objective

Transform Brief + Brand + Knowledge into a validated, tenant-safe **ExecutionPlan** (DAG of tasks). Does **not** execute the graph (Phase 5).

## Flow

```text
POST /v1/executions
  → Brief → Brand → Knowledge
  → ExecutionIntelligence.createPlan
  → ExecutionPlan (APPROVED_FOR_EXECUTION | BLOCKED | INVALID)
  → persist structuredExecutionPlan
  → existing single IntegrationPipeline execution (unchanged)
```

## Guarantees

- Deterministic planner (no vendor SDK)
- Capability IDs validated against real CapabilityRegistry
- Output contracts from OutputContractRegistry
- Explicit dependencies + cycle rejection
- Brand/Knowledge treated as DATA (cannot rewrite tenant/policy)
- `APPROVED_FOR_EXECUTION` ≠ human approval

## Opt-out

`metadata.skipExecutionIntelligence` or `metadata.skipPlanning`
