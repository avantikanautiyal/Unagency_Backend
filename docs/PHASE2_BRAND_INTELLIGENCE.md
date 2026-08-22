# Phase 2 — Brand Intelligence

## Objective

Make UNAGENCY understand how a specific brand should communicate and look — as structured **BrandContext** that reaches the actual provider request.

This is **brand-aware generation**, not BrandGuard / brand-safe validation.

## Flow

```text
POST /v1/executions
  → BriefIntelligence → StructuredBrief
  → BrandIntelligence.getContext → BrandContext
  → composeBrandAwarePrompt (deterministic renderer)
  → IntegrationPipeline → Model Router → Runtime → provider payload.prompt
```

## Guarantees

- Trusted `organizationId` from principal
- Explicit `metadata.brandId` required (no first-brand guess)
- `sampleBrandBrain` is **not** bootstrapped on production paths
- Missing brand → `EMPTY`/`MISSING` EmptyBrandContext (never invent tone)
- Knowledge snippets stay separate from Brand Context

## Opt-out

`metadata.skipBrandIntelligence` or `metadata.skipBrandKnowledge`
