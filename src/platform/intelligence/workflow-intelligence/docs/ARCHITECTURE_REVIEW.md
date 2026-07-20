# Workflow Intelligence Platform — Architecture Review

## Mission

Convert an `ExecutionTeamPlan` from Agent Planning into a complete executable
workflow graph for the Execution Platform. Plans, orchestrates, simulates, and
validates — **never executes AI**.

## Position

```
Agent Planning (M5.4)
        ↓
ExecutionTeamPlan
        ↓
Workflow Intelligence (M5.5) ← NEW
        ↓
WorkflowExecutionPlan
        ↓
Execution Intelligence (future input)
```

## Architecture Diagram

```mermaid
flowchart TB
  subgraph input [Input]
    ETP[ExecutionTeamPlan]
  end

  subgraph wi [Workflow Intelligence]
    WA[Workflow Analysis]
    SB[Stage Builder]
    GB[Graph Builder]
    DP[Dependency Planner]
    PP[Parallelization Planner]
    CB[Conditional Branch Planner]
    AP[Approval Planner]
    CP[Checkpoint Planner]
    RP[Rollback Planner]
    RC[Recovery Planner]
    RS[Resume Planner]
    SIM[Simulator]
    OPT[Optimizer]
    VAL[Validator]
    ENG[Workflow Intelligence Engine]
  end

  subgraph output [Outputs]
    WEP[WorkflowExecutionPlan]
    EWG[ExecutionWorkflowGraph]
    SR[SimulationReport]
    WR[WorkflowIntelligenceReport]
  end

  ETP --> WA --> GB --> DP --> PP --> CB
  GB --> SB
  CB --> AP --> CP --> RP --> RC --> RS
  SB --> ENG
  RS --> ENG
  ENG --> SIM --> OPT --> VAL
  ENG --> WEP
  ENG --> EWG
  ENG --> WR
  ENG --> SR
```

## Pipeline

```
ExecutionTeamPlan → Graph → Stages → Dependencies → Parallelization
  → Approvals → Checkpoints → Rollback/Recovery/Resume
  → Simulation → Optimization → Validation → WorkflowExecutionPlan
```

## Design Principles

- Immutable DAG nodes and edges
- Artifact-only flow between nodes (no prompts)
- Dry-run simulation without AI
- Optimization recommendations only — never modifies graph
- Constructor injection; `Result<T>`; no frozen module changes

## Dependencies

```
workflow-intelligence → agent-planning (contracts), shared
workflow-intelligence ⇏ execution-intelligence, providers, model-intelligence
```
