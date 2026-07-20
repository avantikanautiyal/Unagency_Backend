# Intelligence Control Plane — Future Extension Report

## FE-CP1 — Execution Runtime Handoff

Wire `ExecutionReadyPlan` to the Execution Runtime platform as the sole execution entry point.
Control plane remains planning-only; runtime consumes `RoutingDecision` + `NegotiationResult`.

## FE-CP2 — Parallel Stage Optimization

Independent stages (e.g., Model Intelligence alongside Execution Intelligence prep) could run
concurrently when contract dependencies allow. Current implementation is intentionally sequential
for determinism.

## FE-CP3 — Stage Skipping / Conditional Pipeline

Support partial pipelines (e.g., re-plan from governance onward) via `PipelineCoordinator`
with explicit `fromStage` / `toStage` bounds. Requires artifact replay from persistent store.

## FE-CP4 — Persistent Pipeline Context

`PipelineContext` currently lives in-memory per request. Add `IPipelineContextStore` for
audit replay, debugging, and long-running approval workflows.

## FE-CP5 — Live Telemetry Export

`telemetry/` directory reserved for OpenTelemetry spans per stage. Wire when observability
platform is standardized.

## FE-CP6 — Human-in-the-Loop Gates

Governance may return `pending_approval`. Future: pause pipeline at governance stage,
resume when approval artifact is injected via `lifecycle/` resume API.

## FE-CP7 — Custom Stage Plugins

`coordinator/` extension point for optional stages (e.g., compliance re-check) inserted
between frozen stages without modifying frozen modules.

## FE-CP8 — Negotiation Production Wiring

Current factory uses `setupNegotiation()` test registries. Production factory should accept
injected `ICapabilityRegistry`, `IProviderRegistry`, and policy configuration.

## Non-Goals (This Milestone)

- Provider SDK integration
- HTTP/gRPC API surface
- AI model invocation
- Modifications to frozen intelligence modules
