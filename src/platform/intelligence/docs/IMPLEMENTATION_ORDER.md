# Implementation Order (Post-Architecture)

Do **not** start until architecture approval.

## Phase 0 — Foundation (DONE)

- Kernel, shared, config, events, security, telemetry
- Runtime, policies, scheduler (contracts)
- Capability Catalog, Provider Capability Matrix, Execution Planner (contracts)

## Phase 1 — Planning spine (first implementation slice)

1. Config-driven `ICapabilityCatalog` loader (no AI)
2. Config-driven `IProviderCapabilityMatrix` (no SDKs)
3. `IExecutionPlanner` implementation using catalog + matrix + policies
4. Contract tests for plan output shape

## Phase 2 — Gateway & orchestration

1. `IIntelligenceGateway` (business entry)
2. Orchestrator consumes `ExecutionPlan` only
3. Execution engine + first provider adapter (leaf)
4. Wire kernel composition

## Phase 3 — Quality & durability

1. Evaluation, learning signals
2. Execution metadata persistence
3. Scheduler adapters (BullMQ later)
4. Business module adoption via gateway only

## Explicitly deferred

- Provider SDKs until Phase 2 leaf adapters
- Prompt compiler, context builder
- Workflow runtime
- MongoDB / Redis / Kafka until needed behind interfaces
