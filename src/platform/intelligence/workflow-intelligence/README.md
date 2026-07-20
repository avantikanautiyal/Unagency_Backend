# Workflow Intelligence Platform (M5.5)

Converts `ExecutionTeamPlan` into a complete executable workflow graph. Plans,
orchestrates, simulates, and validates — **without AI execution**.

## Quick Start

```typescript
import { createWorkflowIntelligencePlatform } from "./workflow-intelligence";
import { setupAgentPlanningPlatform } from "./agent-planning/testing";

// Get ExecutionTeamPlan from Agent Planning
const { engine: agentEngine } = setupAgentPlanningPlatform();
const agentResult = await agentEngine.plan(agentRequest);

// Plan workflow
const { engine } = createWorkflowIntelligencePlatform();
const result = await engine.plan({
  requestId: "wi_1",
  executionTeamPlan: agentResult.value!.executionTeamPlan,
});
```

## Pipeline

```
ExecutionTeamPlan → Workflow Graph → Stages → Dependencies
  → Approvals → Checkpoints → Rollback/Recovery/Resume
  → Simulation → WorkflowExecutionPlan
```

## Outputs

- `WorkflowExecutionPlan` — primary downstream contract
- `ExecutionWorkflowGraph` — immutable DAG with artifact flow
- `SimulationReport` — dry-run execution order and timing
- `WorkflowOptimizationReport` — recommendations (graph not modified)
- `WorkflowIntelligenceReport` — full analysis artifact

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Review](./docs/ARCHITECTURE_REVIEW.md) | System design |
| [Implementation Report](./docs/IMPLEMENTATION_REPORT.md) | Models and modules |
| [Future Extensions](./docs/FUTURE_EXTENSION_REPORT.md) | Integration points |
| [Models & Diagrams](./docs/MODELS.md) | DAG, tests, artifacts |
| [ACP Report](./docs/ACP_REPORT.md) | Architecture proposals |

## Tests

```bash
npx jest tests/platform/intelligence/workflow-intelligence
```
