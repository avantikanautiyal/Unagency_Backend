# Agent Planning Platform — Future Extension Report

## Extension Points (Not Implemented)

| Extension | Interface | Integration Point |
|-----------|-----------|-------------------|
| Autonomous agents | `IAgentRegistry` | Long-running agent profiles |
| Memory-enabled agents | `AgentRoleProfile` | Shared memory contracts |
| Collaborative planning | `ICoordinationPlanner` | Multi-round planning |
| Human-agent teams | `ReviewHierarchy` | Human gate expansion |
| Cross-workspace teams | `ExecutionTeamPlan` | Workspace scoping |
| Agent marketplace | `IAgentRegistry` | External agent catalog |
| Custom org agents | `TeamPlaybook` | Organization-scoped playbooks |
| Load balancing | `balancing/` | Capacity, availability, workload |

## Execution Intelligence Integration (Future)

`ExecutionTeamPlan` designed as primary input to Execution Intelligence.
Wire in dedicated integration milestone — no changes in M5.4.

## Non-Goals

- AI execution, provider integration, SDKs, HTTP
- Modifications to frozen modules
