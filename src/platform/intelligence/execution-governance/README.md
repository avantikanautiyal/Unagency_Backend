# Execution Governance Platform (M5.6)

Governance layer between Workflow Intelligence and Execution Intelligence.
Evaluates, validates, approves, blocks, and escalates — **without AI execution**.

## Quick Start

```typescript
import { createExecutionGovernancePlatform } from "./execution-governance";
import { setupWorkflowIntelligencePlatform } from "./workflow-intelligence/testing";

const workflowPlan = await getWorkflowExecutionPlan();
const { engine } = createExecutionGovernancePlatform();
const result = await engine.evaluate({
  requestId: "gov_1",
  workflowExecutionPlan: workflowPlan,
  budgetLimit: 500,
  regionHint: "us",
});
```

## Pipeline

```
WorkflowExecutionPlan → Policy → Risk → Compliance → Budget
  → Security → Privacy → Quality → Approvals → GovernanceExecutionPlan
```

## Outputs

- `GovernanceExecutionPlan` — primary downstream contract
- `GovernanceDecision` — approved, blocked, pending_approval, etc.
- `RiskAssessment`, `BudgetAssessment`, `ComplianceAssessment`
- `SecurityAssessment`, `PrivacyAssessment`, `GovernanceApprovalPlan`
- `ExecutionAuthorization`, `GovernanceReport`

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture Review](./docs/ARCHITECTURE_REVIEW.md) | System design |
| [Implementation Report](./docs/IMPLEMENTATION_REPORT.md) | Models and modules |
| [Future Extensions](./docs/FUTURE_EXTENSION_REPORT.md) | Integration points |
| [Models & Diagrams](./docs/MODELS.md) | Dependency graph, tests |
| [ACP Report](./docs/ACP_REPORT.md) | Architecture proposals |

## Tests

```bash
npx jest tests/platform/intelligence/execution-governance
```
