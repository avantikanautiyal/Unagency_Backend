# Experience Injection Platform

Consumes the Experience Repository and injects only the most relevant experiences
into future executions.

**Experience Intelligence remembers. Experience Injection applies.**

Execution Intelligence must never search the Experience Repository directly —
it consumes `ExecutionExperiencePackage` from this platform.

## Pipeline

```
Execution Request → Context Extraction → Retrieval → Applicability Matching
→ Similarity Scoring → Deduplication → Conflict Resolution → Prioritization
→ Compression → Packaging → Validation → ExecutionExperiencePackage
```

## Usage

```typescript
import {
  createExperienceInjectionPlatform,
  sampleInjectionRequest,
  setupExperienceInjectionPlatform,
} from "./index";

const { engine } = await setupExperienceInjectionPlatform({ seedCount: 1000 });
const result = await engine.inject(sampleInjectionRequest());

if (result.ok) {
  const pkg = result.value.package;
  // Structured intelligence only — never prompt content
  console.log(pkg.relevantExperiences);
  console.log(pkg.corrections);
  console.log(pkg.explainability);
}
```

## Outputs

`ExecutionExperiencePackage` containing:

- Relevant experiences (top N)
- Corrections, best practices, warnings, anti-patterns
- Optimization suggestions
- Applicability, confidence, evidence references
- Explainability

`advisoryOnly: true` · `containsPromptContent: false`

## Future Consumers (interfaces only)

Execution Intelligence, Prompt Compiler, Model Intelligence, Agent Planning,
Workflow Intelligence — not wired in this milestone.

See `docs/` for architecture review and models.
