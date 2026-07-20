# Provider Consensus — Architecture Review

## Mission

Post-runtime ensemble platform that compares and combines already-executed
provider results into a single explainable canonical outcome.

## Position

```
Provider Runtime (OpenAI / Claude / Gemini / …)
        ↓
CanonicalExecutionResults[]
        ↓
Provider Consensus ← NEW
        ↓
ConsensusResult (single canonical)
```

## Architecture Diagram

```mermaid
flowchart TB
  subgraph inputs [Inputs]
    R1[Provider Result A]
    R2[Provider Result B]
    R3[Provider Result C]
    EVAL[Evaluation / Confidence]
    OBS[Observability Hints]
  end

  subgraph consensus [Provider Consensus]
    CMP[Comparison Engine]
    ARB[Conflict Arbitration]
    STR[Strategy Registry]
    MRG[Merge Engine]
    CONF[Confidence Engine]
    EXP[Explainability]
    ENG[Consensus Engine]
  end

  subgraph output [Output]
    CR[ConsensusResult]
  end

  R1 --> ENG
  R2 --> ENG
  R3 --> ENG
  EVAL --> CMP
  OBS --> CMP
  ENG --> CMP --> ARB --> STR --> MRG --> CONF --> EXP --> CR
```

## Design Principles

- Does **not** replace routing or negotiation
- Does **not** call providers / SDKs / network
- Consumes immutable `ProviderExecutionResult` (+ optional evaluation/observability)
- Never merges blindly — merge mode is explicit and explained
- Constructor injection, `Result<T>`, immutable contracts
- No frozen module modifications

## Dependency Graph

```mermaid
flowchart TD
  PC[provider-consensus]
  RT[providers/runtime contracts]
  EV[evaluation contracts]
  SH[shared]

  PC --> RT
  PC --> EV
  PC --> SH
  PC -.->|never| SDK[provider SDKs]
  PC -.->|never| ROUTE[routing]
```
