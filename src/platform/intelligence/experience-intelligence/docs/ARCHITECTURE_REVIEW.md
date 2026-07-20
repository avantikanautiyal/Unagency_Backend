# Experience Intelligence — Architecture Review

## Mission

Transform historical execution outcomes into reusable organizational experience that
continuously improves future executions. The platform accumulates experience — not AI models.

## Architectural Principle

| Module | Role |
|--------|------|
| Evaluation | Evaluate ONE execution |
| Learning | Discover platform-wide patterns |
| Execution Optimization | Recommend improvements |
| **Experience Intelligence** | Remember strategies and feed back structured experience |

## Experience Architecture Diagram

```mermaid
flowchart TB
  subgraph inputs [Frozen Platform Inputs]
    EVAL[EvaluationReport]
    LEARN[LearningResult]
    OPT[ExecutionOptimizationResult]
    OBS[ProviderObservabilityReport]
    MODEL[ModelDecisionRecord]
    HUMAN[HumanArtifact]
  end

  subgraph ei [Experience Intelligence]
    EXT[Experience Extractor]
    DET[Mistake/Success Detector]
    RCA[Root Cause Analyzer]
    COR[Correction Strategist]
    APP[Applicability Engine]
    CONF[Confidence Engine]
    VAL[Validator]
    REPO[Experience Repository]
    SEARCH[Search Engine]
    ENG[Experience Intelligence Engine]
  end

  subgraph outputs [Outputs]
    EXP[Experience]
    SNAP[Experience Snapshot]
    RPT[Experience Intelligence Report]
  end

  inputs --> EXT --> DET --> RCA --> COR --> APP --> CONF --> VAL --> REPO
  REPO --> SNAP
  REPO --> SEARCH
  ENG --> RPT
```

## Experience Lifecycle Diagram

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> validated: confidence >= 0.7
  validated --> trusted: repeated success
  trusted --> preferred: high reuse score
  preferred --> deprecated: superseded
  deprecated --> archived
  archived --> [*]
```

## Pipeline

```
Historical Executions → Extraction → Mistake Detection → Success Detection
→ Root Cause → Correction → Applicability → Confidence → Validation
→ Repository → Snapshot → Report
```

## Design Principles

- Reuse frozen contracts — never duplicate Evaluation, Learning, Memory, Optimization
- Corrections are advisory only — never modify prompts
- Constructor injection, `Result<T>`, immutable contracts
- In-memory repository only — no database
- Future integration interfaces defined, not implemented

## Dependency Graph

```mermaid
flowchart TD
  EI[experience-intelligence]
  EVAL[evaluation]
  LEARN[learning]
  EO[execution-optimization]
  ART[artifacts]
  MI[model-intelligence]
  RT[routing]
  SH[shared]

  EI --> EVAL
  EI --> LEARN
  EI --> EO
  EI --> ART
  EI --> MI
  EI --> RT
  EI --> SH
  EI -.->|never| PROV[providers/runtime]
  EI -.->|not integrated| CP[control-plane]
```
