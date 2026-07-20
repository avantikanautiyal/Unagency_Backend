# Task Intelligence Platform (M5.3)

Entry point of the UNAGENCY Intelligence Operating System. Converts raw user
requests into structured execution blueprints **before** any AI execution.

## Quick Start

```typescript
import {
  createTaskIntelligencePlatform,
  TaskIntelligenceRequestBuilder,
} from "./task-intelligence";

const { engine } = createTaskIntelligencePlatform();

const request = TaskIntelligenceRequestBuilder.create()
  .withRequestId("req_1")
  .withRawPrompt("Launch a new sneaker collection")
  .withIndustryHint("retail")
  .build();

const result = await engine.analyze(request);
if (result.ok) {
  console.log(result.value.structuredTaskPlan);
  console.log(result.value.taskGraph.dependencyGraph);
}
```

## Pipeline

```
Raw Request → Intent → Business Goal → Classification → Capabilities
  → Decomposition → DAG → Deliverables → Complexity → Constraints
  → Review → StructuredTaskPlan
```

## Client Playbook Library

Versioned, configurable workflows for retail, real estate, and software clients.
When a business scenario is recognized, Task Intelligence expands it into a
full execution plan automatically.

## Outputs

- `StructuredTaskPlan` — primary downstream contract
- `TaskIntelligenceReport` — full analysis artifact
- `TaskGraph` + `DependencyGraph` (DAG)
- `CapabilityMap`, `DeliverablePlan`, `ComplexityProfile`
- `ExecutionConstraintProfile`, `ReviewPlan`

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Review](./docs/ARCHITECTURE_REVIEW.md) | System design |
| [Implementation Report](./docs/IMPLEMENTATION_REPORT.md) | Models and modules |
| [Future Extensions](./docs/FUTURE_EXTENSION_REPORT.md) | Integration points |
| [Models & Diagrams](./docs/MODELS.md) | DAG, tests, artifacts |
| [ACP Report](./docs/ACP_REPORT.md) | Architecture proposals |

## Rules

- No AI model calls, provider execution, SDKs, or networking
- Does not modify frozen modules
- Designed as future input to Execution Intelligence

## Tests

```bash
npx jest tests/platform/intelligence/task-intelligence
```
