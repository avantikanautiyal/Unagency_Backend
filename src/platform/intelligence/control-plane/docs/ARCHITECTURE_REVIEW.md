# Intelligence Control Plane — Architecture Review

## Mission

The Control Plane is the **single orchestration entry point** for UNAGENCY intelligence planning.
It coordinates every frozen intelligence module into one deterministic pipeline and produces an
`ExecutionReadyPlan` without executing providers, SDKs, networking, or AI.

## Position

```
ControlPlaneRequest (raw prompt)
        ↓
Intelligence Control Plane (M6)
        ↓
ExecutionReadyPlan
        ↓
(future) Execution Runtime — not in this milestone
```

## Control Plane Architecture Diagram

```mermaid
flowchart TB
  subgraph input [Input]
    CPR[ControlPlaneRequest]
  end

  subgraph cp [Intelligence Control Plane]
    ENG[IntelligenceControlPlaneEngine]
    ORCH[PipelineOrchestrator]
    VAL[PipelineValidator]
    SIM[PipelineSimulator]
    ADP[Stage Adapters]
  end

  subgraph frozen [Frozen Intelligence Modules]
    TI[Task Intelligence]
    AP[Agent Planning]
    WI[Workflow Intelligence]
    EG[Execution Governance]
    EI[Execution Intelligence]
    MI[Model Intelligence]
    PN[Provider Negotiation]
    PR[Provider Routing]
  end

  subgraph output [Output]
    ERP[ExecutionReadyPlan]
    DIAG[PipelineDiagnostics]
    EXP[UnifiedExplanation]
    ART[ArtifactChain]
  end

  CPR --> ENG
  ENG --> ORCH
  ENG --> VAL
  ENG --> SIM
  ORCH --> ADP
  ADP --> TI --> AP --> WI --> EG --> EI --> MI --> PN --> PR
  ORCH --> ERP
  ORCH --> DIAG
  ORCH --> EXP
  ORCH --> ART
```

## Pipeline Sequence Diagram

```mermaid
sequenceDiagram
  participant Client
  participant Engine as ControlPlaneEngine
  participant Orch as PipelineOrchestrator
  participant TI as Task Intelligence
  participant AP as Agent Planning
  participant WI as Workflow Intelligence
  participant EG as Execution Governance
  participant EI as Execution Intelligence
  participant MI as Model Intelligence
  participant PN as Negotiation
  participant PR as Routing

  Client->>Engine: plan(request)
  Engine->>Orch: execute(request)
  Orch->>TI: analyze(rawPrompt)
  TI-->>Orch: StructuredTaskPlan
  Orch->>AP: plan(structuredTaskPlan)
  AP-->>Orch: ExecutionTeamPlan
  Orch->>WI: plan(executionTeamPlan)
  WI-->>Orch: WorkflowExecutionPlan
  Orch->>EG: evaluate(workflowExecutionPlan)
  EG-->>Orch: GovernanceExecutionPlan
  Orch->>EI: optimize(context+knowledge+prompt)
  Note over Orch,EI: Never receives RawRequest
  EI-->>Orch: ExecutionIntelligenceResult
  Orch->>MI: recommend(capabilityId+department)
  Note over Orch,MI: Never receives RawRequest
  MI-->>Orch: RankedModelCandidates
  Orch->>PN: negotiate(executionPlan)
  PN-->>Orch: NegotiationResult
  Orch->>PR: route(candidates)
  Note over Orch,PR: Never receives RawRequest
  PR-->>Orch: RoutingDecision
  Orch-->>Engine: ExecutionReadyPlan + artifacts
  Engine-->>Client: ControlPlaneReport
```

## Artifact Flow Diagram

```mermaid
flowchart LR
  R[RawRequest] --> TA[TaskArtifact]
  TA --> TMA[TeamArtifact]
  TMA --> WA[WorkflowArtifact]
  WA --> GA[GovernanceArtifact]
  GA --> EA[ExecutionIntelligenceArtifact]
  EA --> MA[ModelDecisionArtifact]
  MA --> NA[NegotiationArtifact]
  NA --> RA[RoutingArtifact]
  RA --> ERA[ExecutionReadyArtifact]
```

## State Machine Diagram

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> task_intelligence
  task_intelligence --> agent_planning
  agent_planning --> workflow_intelligence
  workflow_intelligence --> execution_governance
  execution_governance --> execution_intelligence
  execution_intelligence --> model_intelligence
  model_intelligence --> negotiation
  negotiation --> routing
  routing --> complete
  complete --> [*]

  task_intelligence --> failed: stage error
  agent_planning --> failed
  workflow_intelligence --> failed
  execution_governance --> failed
  execution_intelligence --> failed
  model_intelligence --> failed
  negotiation --> failed
  routing --> failed
  failed --> [*]
```

## Design Principles

- **Constructor injection** — all engines wired via `createIntelligenceControlPlane()`
- **Immutable contracts** — frozen artifacts passed stage-to-stage
- **Result&lt;T&gt;** — no thrown errors across module boundaries
- **No singleton state** — deterministic helpers for tests
- **No shortcuts** — downstream stages never receive `RawRequest`
- **No frozen module modifications** — adapters live in control-plane only

## Dependency Graph

```mermaid
flowchart TD
  CP[control-plane]
  TI[task-intelligence]
  AP[agent-planning]
  WI[workflow-intelligence]
  EG[execution-governance]
  EI[execution-intelligence]
  MI[model-intelligence]
  PN[providers/negotiation]
  PR[providers/routing]
  CTX[context]
  KN[knowledge]
  PC[prompt-compiler]
  SH[shared]

  CP --> TI --> AP --> WI --> EG --> EI --> MI --> PN --> PR
  CP --> CTX
  CP --> KN
  CP --> PC
  CP --> SH
  CP -.->|never| RT[providers/runtime]
  CP -.->|never| SDK[providers/sdk]
```

## Responsibilities

| Component | Role |
|-----------|------|
| `IntelligenceControlPlaneEngine` | Public API: `plan`, `simulate`, `explain` |
| `PipelineOrchestrator` | Sequential stage execution, timing, artifact assembly |
| `Stage Adapters` | Map canonical artifacts to downstream requests |
| `DefaultPipelineValidator` | Artifact integrity and stage ordering |
| `DefaultPipelineSimulator` | Dry-run report without provider execution |
