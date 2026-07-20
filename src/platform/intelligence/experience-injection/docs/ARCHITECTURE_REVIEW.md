# Experience Injection — Architecture Review

## Mission

Bridge between Experience Repository and execution consumers. Retrieve, rank, resolve
conflicts, compress, and package organizational experience for advisory consumption.

## Experience Retrieval Architecture

```mermaid
flowchart TB
  subgraph consumers [Future Consumers — interfaces only]
    EI[Execution Intelligence]
    PC[Prompt Compiler]
    MI[Model Intelligence]
  end

  subgraph injection [Experience Injection]
    ENG[ExperienceInjectionEngine]
    CTX[Context Extractor]
    RET[Retriever]
    APP[Applicability Matcher]
    SIM[Similarity Engine]
    DED[Deduplicator]
    CONF[Conflict Resolver]
    PRI[Prioritizer]
    CMP[Compressor]
    PKG[Packager]
    VAL[Validator]
  end

  subgraph source [Experience Intelligence — frozen]
    REPO[IExperienceRepository]
  end

  subgraph output [Output]
    EEP[ExecutionExperiencePackage]
  end

  EI -.-> ENG
  ENG --> CTX --> RET --> REPO
  RET --> APP --> SIM --> DED --> CONF --> PRI --> CMP --> PKG --> VAL --> EEP
  EEP -.-> EI
  EEP -.-> PC
  EEP -.-> MI
```

## Pipeline

```
Execution Request
  → Context Extraction
  → Experience Retrieval
  → Applicability Matching
  → Similarity Scoring
  → Deduplication
  → Conflict Resolution
  → Priority Ranking
  → Compression (Top N)
  → Packaging
  → Validation
  → ExecutionExperiencePackage
```

## Design Principles

- Consumes `IExperienceRepository` — never duplicates Experience Intelligence
- Never contains raw prompts or prompt fragments
- Corrections remain `advisoryOnly`
- Semantic similarity is a placeholder (deterministic Jaccard) — never calls AI
- Constructor injection, `Result<T>`, immutable contracts
- No networking, SDKs, providers, databases, frozen module modifications

## Dependency Graph

```mermaid
flowchart TD
  INJ[experience-injection]
  EXP[experience-intelligence]
  TI[task-intelligence]
  EO[execution-optimization]
  KN[knowledge]
  SH[shared]

  INJ --> EXP
  INJ --> TI
  INJ --> EO
  INJ --> KN
  INJ --> SH
  INJ -.->|not integrated| EINT[execution-intelligence]
  INJ -.->|never| PROV[providers]
```
