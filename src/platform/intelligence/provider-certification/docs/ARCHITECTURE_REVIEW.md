# Provider Certification Framework — Architecture Review

## Mission

Gate every provider adapter before it enters Routing or Negotiation. The framework validates
conformance to UNAGENCY adapter contracts using mocks — **no networking, no vendor SDKs**.

## Certification Architecture Diagram

```mermaid
flowchart TB
  subgraph input [Input]
    ADP[IProviderAdapter]
    MAN[ProviderManifest]
    MOCK[Mock SDK / Transport]
  end

  subgraph pcf [Provider Certification Framework]
    ENG[ProviderCertificationEngine]
    SUITES[Certification Suites x9]
    VAL[Area Validators x25]
    SCORE[Scorecard Builder]
    MAT[Matrix Builder]
    BADGE[Badge Issuer]
  end

  subgraph output [Output]
    RPT[CertificationReport]
    CARD[Scorecard]
    CAP[CapabilityMatrix]
    COMP[ComplianceMatrix]
    PERF[PerformanceMatrix]
    BDG[CertificationBadge]
  end

  ADP --> ENG
  MAN --> ENG
  MOCK -.-> VAL
  ENG --> SUITES --> VAL
  ENG --> SCORE --> CARD
  ENG --> MAT --> CAP
  ENG --> MAT --> COMP
  ENG --> MAT --> PERF
  ENG --> BADGE --> BDG
  ENG --> RPT
```

## Certification Pipeline

```mermaid
flowchart LR
  REQ[CertificationRequest] --> CONF[Conformance Suite]
  CONF --> STR[Streaming Suite]
  STR --> FC[Function Calling Suite]
  FC --> JSON[Structured Output Suite]
  JSON --> TOK[Tokenization Suite]
  TOK --> ERR[Errors Suite]
  ERR --> OBS[Observability Suite]
  OBS --> SEC[Security Suite]
  SEC --> PERF[Performance Suite]
  PERF --> AGG[Aggregate Scores]
  AGG --> STATUS[Resolve Status]
  STATUS --> RPT[CertificationReport]
```

## Design Principles

- Constructor injection; `Result<T>`; immutable contracts
- Mock-only execution — adapters exercised via wire payloads
- 25 certification areas across 9 suites
- 13 benchmark scenarios (interface compatibility only)
- No frozen module modifications

## Dependency Graph

```mermaid
flowchart TD
  PCF[provider-certification]
  ADP[providers/adapters]
  INT[providers/integration]
  SH[shared]

  PCF --> ADP
  PCF --> INT
  PCF --> SH
  PCF -.->|never| SDK[providers/sdk vendors]
  PCF -.->|never| NET[networking]
```

## Certification Statuses

| Status | Condition |
|--------|-----------|
| certified | All suites pass, score ≥ 70 |
| certified_with_warnings | Pass with warnings |
| rejected | Suite failures or score < 70 |
| experimental | Manifest maturity = experimental |
| deprecated | Manifest maturity/status deprecated |
