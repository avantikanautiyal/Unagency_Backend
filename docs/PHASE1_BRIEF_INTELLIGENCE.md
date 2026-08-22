# Phase 1 — Brief Intelligence

## Objective

Transform natural-language execution requests into a validated, tenant-scoped **StructuredBrief** on the canonical production path, and have IntegrationPipeline consume Brief-derived capability / scenario signals.

## Flow

```text
POST /v1/executions
  → Enterprise Gateway
  → ExecutionApiService.create
  → BriefIntelligenceEngine.createBrief
  → validateStructuredBrief
  → metadata (briefPrimaryCapability, structuredBrief, …)
  → composeBriefAwarePrompt
  → IntegrationPipeline / async lane
  → Capability hint + Task Intelligence / Runtime
```

## What is implemented

- Canonical `StructuredBrief` (`platform/os/brief/contracts/structured-brief.ts`)
- Deterministic intent / deliverable / constraint extraction (no direct vendor SDK)
- Deterministic validation (`validateStructuredBrief`)
- Persistence on execution extras (`structuredBrief`) + `getBrief(executionId, tenant)`
- Pipeline consumption via `briefPrimaryCapability` / `capabilityHint` / `scenarioHint` / brief-aware prompt

## What is intentionally not implemented

- LLM-based briefing via Model Router (Phase 1 uses deterministic extraction; provider-agnostic abstraction preserved)
- TaskGraphExecutor / multi-task orchestration
- BrandGuard / SpecGuard / production Evaluation / Human Review / Learning

## Opt-out

`metadata.skipBriefIntelligence: true` skips Brief Intelligence (e.g. internal jobs).
