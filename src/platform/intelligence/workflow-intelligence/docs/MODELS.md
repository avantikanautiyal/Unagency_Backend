# Workflow Intelligence — Models & Diagrams

## Workflow DAG (Product Launch)

```mermaid
flowchart TD
  subgraph research [Research Stage]
    MR[Market Research Analyst]
    AS[Audience Strategist]
    BS[Brand Specialist]
  end

  subgraph planning [Planning Stage]
    CS[Campaign Strategist]
    CP[Content Planner]
  end

  subgraph generation [Generation Stage]
    CW[Copywriter]
    CD[Creative Director]
    MP[Media Planner]
    SEO[SEO Specialist]
  end

  subgraph review [Review Stage]
    QA[QA Reviewer]
  end

  subgraph approval [Approval Stage]
    HA[Human Approval]
  end

  MR --> CS
  AS --> CS
  BS --> CS
  CS --> CP
  CP --> CW
  CP --> CD
  CP --> MP
  CW --> QA
  CD --> QA
  QA --> HA
```

## Dependency Graph

Edges carry dependency kind and artifact flow (consumes/produces).

## Unit Test Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| `engine.test.ts` | 6 | Full pipeline, DAG, plans, simulation, explainability, optimization |

Run: `npx jest tests/platform/intelligence/workflow-intelligence`

## Output Artifacts

| Artifact | Contract |
|----------|----------|
| WorkflowExecutionPlan | `contracts/plan.ts` |
| ExecutionWorkflowGraph | `contracts/graph.ts` |
| WorkflowStage | `contracts/stages.ts` |
| ApprovalPlan | `contracts/approvals.ts` |
| CheckpointPlan | `contracts/checkpoints.ts` |
| RollbackPlan | `contracts/recovery.ts` |
| RecoveryPlan | `contracts/recovery.ts` |
| ResumePlan | `contracts/recovery.ts` |
| SimulationReport | `contracts/simulation.ts` |
| WorkflowIntelligenceReport | `contracts/result.ts` |
