# Intelligence Kernel

The Kernel provides **platform infrastructure**: composition/DI, lifecycle, registry primitives, events, telemetry, and shared types.

## Phase 0 ownership

- **Kernel is infrastructure**, not the production HTTP AI orchestrator.
- Production HTTP path: **Enterprise Gateway → ExecutionApiService → IntegrationPipeline → Provider Runtime**.
- `IntelligenceGateway` / `IntelligenceOrchestrator` (built via `bootstrapIntelligenceGateway`) are **not** mounted by `app.ts`.

Do not treat Kernel folder completeness as production OS completeness.
