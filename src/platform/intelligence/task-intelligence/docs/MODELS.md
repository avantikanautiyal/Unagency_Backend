# Task Intelligence — Models & Diagrams

## Ranking / Planning Pipeline

```mermaid
flowchart LR
  A[Raw Prompt] --> B[Intent]
  B --> C[Business Objective]
  C --> D[Department + Domain]
  D --> E[Capabilities]
  E --> F{Playbook Match?}
  F -->|Yes| G[Playbook Expansion]
  F -->|No| H[Capability Decomposition]
  G --> I[Task Nodes]
  H --> I
  I --> J[DAG Analysis]
  J --> K[Deliverables]
  K --> L[Complexity + Constraints]
  L --> M[Review Plan]
  M --> N[StructuredTaskPlan]
```

## Dependency Graph

```mermaid
flowchart TD
  MR[Market Research] --> AA[Audience Analysis]
  MR --> BR[Brand Review]
  AA --> CS[Campaign Strategy]
  BR --> CS
  CS --> CC[Content Calendar]
  CS --> IC[Instagram Carousel]
  CS --> IR[Instagram Reel]
  CC --> IC
  CC --> IR
  CS --> FA[Facebook Ads]
  CS --> GA[Google Ads]
  CS --> EC[Email Campaign]
  CS --> LP[Landing Page Copy]
  LP --> SEO[SEO Metadata]
  CS --> KPI[Performance KPI Plan]
```

## Unit Test Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| `engine.test.ts` | 4 | Full pipeline, DAG, explainability, deliverables |
| `playbook.test.ts` | 3 | Playbook library, matching |

**Total: 7 tests** — all passing without AI or provider calls.

Run: `npx jest tests/platform/intelligence/task-intelligence`

Full intelligence suite: **481 tests passing**.

## Output Artifacts

| Artifact | Contract |
|----------|----------|
| StructuredTask | `contracts/task.ts` |
| TaskNode | `contracts/task.ts` |
| TaskGraph | `contracts/graph.ts` |
| DependencyGraph | `contracts/graph.ts` |
| CapabilityMap | `contracts/capability.ts` |
| DepartmentClassification | `contracts/classification.ts` |
| IntentProfile | `contracts/intent.ts` |
| BusinessObjective | `contracts/business.ts` |
| ComplexityProfile | `contracts/complexity.ts` |
| DeliverablePlan | `contracts/deliverable.ts` |
| ExecutionConstraintProfile | `contracts/constraints.ts` |
| TaskExecutionPlan | `contracts/planning.ts` |
| TaskIntelligenceReport | `contracts/result.ts` |
