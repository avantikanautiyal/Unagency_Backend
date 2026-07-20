# Capability Intelligence Platform

Canonical intelligence layer for **understanding, cataloguing, composing, optimizing,
and evolving AI capabilities**.

Business modules never request GPT / Claude / Gemini / OpenAI / Anthropic.

They request **capabilities**:

- `marketing.social.carousel`
- `marketing.copywriting`
- `design.image_generation`
- `software.code_generation`
- …

Providers and models become interchangeable **implementations**.

## Pipeline

```
Business Goal
  → Capability Discovery
  → Capability Composition
  → Dependency Resolution
  → Capability Graph
  → Capability Bundle
  → Execution Capability Plan
```

## Usage

```typescript
import { createCapabilityIntelligencePlatform } from "./index";
import { sampleMarketingObjectiveRequest } from "./testing";

const { engine } = createCapabilityIntelligencePlatform();
const report = await engine.plan(sampleMarketingObjectiveRequest());

if (report.ok) {
  console.log(report.value.executionPlan.capabilityIds);
  console.log(report.value.bundle.graph.shape);
  console.log(report.value.recommendations.primary[0]?.evidence);
}
```

## Outputs

`CapabilityBundle`, `CapabilityGraph`, `CapabilityDependencies`,
`CapabilityExecutionPlan`, recommendations, maturity, compatibility, scorecards.

See `docs/` for models and ACP. Future consumers (Execution / Model Intelligence,
Negotiation, Routing, Mesh, Consensus) are **interfaces only** — not wired.
