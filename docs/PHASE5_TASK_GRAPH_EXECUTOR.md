# Phase 5 — Task Graph Executor

## Objective

Execute `APPROVED_FOR_EXECUTION` `OsExecutionPlan` DAGs through existing Integration/capability infrastructure.

## Flow

```text
OsExecutionPlan (Phase 4)
  → inspectPlanForExecution
  → TaskGraphExecutorEngine
  → TaskScheduler (runnable + parallel waves)
  → bounded ConcurrencyLimiter
  → ITaskCapabilityRunner (Integration or Controllable)
  → Capability Registry + Output Contract validation
  → persist TaskGraphRunSnapshot
```

## API (domain, via ExecutionApiService)

- `executeTaskGraph(executionId)`
- `resumeTaskGraph(executionId)`
- `cancelTaskGraph(executionId)`
- `getTaskGraphStatus(executionId)`

Does not replace single-capability HTTP create path (backward compatible).
