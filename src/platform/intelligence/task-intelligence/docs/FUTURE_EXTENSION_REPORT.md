# Task Intelligence Platform — Future Extension Report

## Extension Points (Not Implemented)

| Extension | Interface | Integration Point |
|-----------|-----------|-------------------|
| Industry-specific taxonomies | `TASK_TAXONOMY` tree | Add taxonomy nodes |
| Custom client workflows | `IPlaybookRepository` | Org-scoped playbooks |
| Department playbooks | `ClientPlaybook` | Department field |
| Multi-agent planning | `ITaskDecomposer` | Agent assignment layer |
| Project templates | `templates/` | Template registry |
| Campaign templates | Playbook tasks | Marketing calendar |
| Business process libraries | `IPlaybookRepository` | BPM import |
| Calendar-aware planning | `IWorkflowPlanner` | Schedule constraints |
| Resource-aware planning | `ExecutionConstraintProfile` | Team capacity |

## Execution Intelligence Integration (Future)

`StructuredTaskPlan` is designed to replace raw user prompts as the primary
input to Execution Intelligence. Wire in a dedicated integration milestone —
no changes to frozen Execution Intelligence in M5.3.

## Playbook Evolution

- Organization-scoped playbooks via `organizationId` on `ClientPlaybook`
- Versioned updates without breaking downstream contracts
- Playbook matching via ML classification (extension point only)

## Non-Goals (This Milestone)

- AI model calls for intent classification
- Provider execution, SDKs, HTTP, database
- Modifications to frozen modules
