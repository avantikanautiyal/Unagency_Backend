# Experience Intelligence Platform

Transforms historical execution outcomes into reusable organizational experience.

**UNAGENCY learns. AI models do not.**

This module remembers what worked, what failed, why it happened, and how future executions
should improve — without modifying prompts, models, providers, or workflows.

## Pipeline

```
Historical Executions → Extraction → Mistake/Success Detection → Root Cause Analysis
→ Correction Strategy → Applicability → Confidence → Validation → Repository → Report
```

## Usage

```typescript
import {
  createExperienceIntelligencePlatform,
  sampleExperienceIntelligenceRequest,
} from "./index";

const { engine } = createExperienceIntelligencePlatform();
const result = await engine.process(sampleExperienceIntelligenceRequest(100));

if (result.ok) {
  console.log(result.value.experiences);
  console.log(result.value.rootCauses);
  console.log(result.value.correctionStrategies);
}
```

## Inputs (frozen contracts only)

EvaluationReport, LearningResult, ExecutionOptimizationResult, observability reports,
model decision records, human artifacts, routing decisions, and more.

## Outputs

- `Experience` — canonical immutable experience object
- `ExperienceIntelligenceReport`
- `ExperienceSnapshot`
- Root causes, correction strategies, applicability maps

Corrections are **advisory only** — they never modify prompts directly.

See `docs/` for architecture review and models.
