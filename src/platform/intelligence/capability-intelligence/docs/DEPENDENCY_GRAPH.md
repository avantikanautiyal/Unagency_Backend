# Dependency Graph

```
capability-intelligence
  ├── shared/result
  ├── shared/errors
  ├── task-intelligence/contracts (StructuredTaskPlan) [read-only]
  ├── agent-planning/contracts (ExecutionTeamPlan) [read-only]
  ├── workflow-intelligence/contracts (WorkflowExecutionPlan) [read-only]
  ├── execution-governance/contracts (GovernanceExecutionPlan) [read-only]
  ├── execution-intelligence/contracts (ExecutionIntelligenceResult) [read-only]
  ├── experience-injection/contracts (ExecutionExperiencePackage) [read-only]
  ├── knowledge/contracts (KnowledgeSnapshot) [read-only]
  └── context/contracts (ContextSnapshot) [read-only]

Does NOT depend on:
  routing engines, runtime executors, provider SDKs, networking,
  provider-mesh / consensus wiring (interfaces only)
```
