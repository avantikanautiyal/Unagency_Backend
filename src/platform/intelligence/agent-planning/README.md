# Agent Planning Platform (M5.4)

Multi-Agent Planning & Orchestration — decides how work is distributed across
specialized AI agents **before** Execution Intelligence. No AI execution.

## Quick Start

```typescript
import { createAgentPlanningPlatform } from "./agent-planning";
import { setupTaskIntelligencePlatform } from "./task-intelligence/testing";

// Get StructuredTaskPlan from Task Intelligence
const { engine: taskEngine } = setupTaskIntelligencePlatform();
const taskResult = await taskEngine.analyze({ requestId: "ti_1", rawPrompt: "Launch a new sneaker collection" });

// Plan agent team
const { engine } = createAgentPlanningPlatform();
const result = await engine.plan({
  requestId: "ap_1",
  structuredTaskPlan: taskResult.value!.structuredTaskPlan,
  scenarioHint: "Launch a new sneaker collection",
});
```

## Pipeline

```
StructuredTaskPlan → Role Assignment → Agent Graph → Coordination
  → Review Hierarchy → Merge Strategy → ExecutionTeamPlan
```

## Outputs

- `ExecutionTeamPlan` — primary downstream contract
- `AgentGraph` — collaboration graph with artifact edges
- `RoleAssignmentMap` — task-to-agent mappings with fallbacks
- `CommunicationPlan`, `ReviewHierarchy`, `MergePlan`
- `CoordinationPlan`, `DelegationPlan`, `EscalationPlan`

## Team Playbooks

Reusable teams: Marketing Campaign, Product Launch, Software Development,
Research, Creative Studio, and more.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Review](./docs/ARCHITECTURE_REVIEW.md) | System design |
| [Implementation Report](./docs/IMPLEMENTATION_REPORT.md) | Models and modules |
| [Future Extensions](./docs/FUTURE_EXTENSION_REPORT.md) | Integration points |
| [Models & Diagrams](./docs/MODELS.md) | Graphs, tests, artifacts |
| [ACP Report](./docs/ACP_REPORT.md) | Architecture proposals |

## Tests

```bash
npx jest tests/platform/intelligence/agent-planning
```
