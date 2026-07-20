# Model Intelligence Platform (M5.2)

AI brain for understanding every model across providers — benchmarks, rankings,
recommendations, and explainability — **without provider execution**.

## Quick Start

```typescript
import {
  createModelIntelligencePlatform,
  ModelIntelligenceRequestBuilder,
} from "./model-intelligence";

const { engine } = createModelIntelligencePlatform();

const request = ModelIntelligenceRequestBuilder.create()
  .withRequestId("req_1")
  .withCapabilityId("content.create.carousel")
  .withDepartment("social_media")
  .withTaskDescription("Generate Instagram Carousel")
  .build();

const result = await engine.recommend(request);
if (result.ok) {
  console.log(result.value.candidates.candidates[0]);
  console.log(result.value.decisionRecord);
}
```

## Pipeline

```
Canonical Models → Knowledge Base → Benchmarks → Scoring → Ranking
  → Recommendation → Model Decision Record → Leaderboards
```

## Outputs

- `RankedModelCandidates` — scored, explained model rankings
- `ModelDecisionRecord` — first-class selection artifact
- `ModelScoreCard` — 18-dimension scores
- `DepartmentLeaderboard` / `CapabilityLeaderboard`
- `BenchmarkReport` / `PredictionReport`

## Model Knowledge Base

Rich profiles per model: release history, strengths, weaknesses, recommended use
cases, unsupported features, cost/performance tiers, provider caveats.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Review](./docs/ARCHITECTURE_REVIEW.md) | System design and diagrams |
| [Implementation Report](./docs/IMPLEMENTATION_REPORT.md) | Modules, scoring, pipeline |
| [Future Extensions](./docs/FUTURE_EXTENSION_REPORT.md) | HELM, SWE-bench, telemetry |
| [Models & Diagrams](./docs/MODELS.md) | Leaderboards, dependencies, tests |
| [ACP Report](./docs/ACP_REPORT.md) | Architecture change proposals |

## Rules

- No provider execution, SDKs, or networking
- Consumes Model Registry (M5.1) only for model metadata
- Does not modify frozen Negotiation or Routing platforms

## Tests

```bash
npx jest tests/platform/intelligence/model-intelligence
```
