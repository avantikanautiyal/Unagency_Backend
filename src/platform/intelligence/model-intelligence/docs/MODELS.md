# Model Intelligence — Models & Diagrams

## Leaderboard Architecture

```mermaid
flowchart TB
  SC[ModelScoreCards] --> GE[Global Leaderboard]
  SC --> PE[Per Provider]
  SC --> DE[Per Department]
  SC --> CE[Per Capability]
  SC --> SE[Per Scope]
  SE --> CT[Cost Tier]
  SE --> RT[Region]
  SE --> LT[Latency Tier]
  SE --> ET[Enterprise Tier]
```

## Dependency Graph

```mermaid
flowchart TD
  shared[shared]
  mr[model-registry]
  mi[model-intelligence]

  mi --> shared
  mi --> mr

  learning[learning] -.-> mi
  evaluation[evaluation] -.-> mi
  exec_opt[execution-optimization] -.-> mi
  exec_intel[execution-intelligence] -.-> mi
  artifacts[artifacts] -.-> mi

  negotiation[negotiation] --> mi
  routing[routing] --> mi

  style mi fill:#e8f5e9
  style mr fill:#e3f2fd
```

Solid = direct dependency. Dashed = optional contract inputs. Downstream
platforms consume outputs; Model Intelligence does not import them.

## Recommendation Pipeline

```mermaid
sequenceDiagram
  participant Client
  participant Engine as ModelIntelligenceEngine
  participant Scoring
  participant Ranking
  participant Rec as RecommendationEngine
  participant KB as Knowledge Base

  Client->>Engine: ModelIntelligenceRequest
  Engine->>Scoring: scoreAll(models, KB)
  Scoring->>KB: get profiles
  Scoring-->>Engine: ModelScoreCards
  Engine->>Ranking: rank(request, cards, models)
  Ranking->>KB: strengths/weaknesses
  Ranking-->>Engine: RankedModelCandidates
  Engine->>Rec: recommend + buildDecisionRecord
  Rec-->>Engine: ModelRecommendation + ModelDecisionRecord
  Engine-->>Client: ModelIntelligenceResult
```

## Model Intelligence Profile

| Field | Source |
|-------|--------|
| Provider / Model / Version | Model Registry |
| Lifecycle | Model Registry + Knowledge Base |
| Capabilities / Modalities | Model Registry |
| Context / Output windows | Model Registry limits |
| Flags (streaming, reasoning, vision, etc.) | Model Registry |
| Pricing | Model Registry |
| Latency / Reliability | Performance Repository |
| Known limitations | Knowledge Base |
| Enterprise ready | Knowledge Base |

## Model Decision Record Schema

```
ModelDecisionRecord
├── recordId
├── capabilityId, department?
├── candidateModels[]
├── rankingScores: Record<modelId, score>
├── rankingExplanation
├── winningModel
├── fallbackModels[]
├── expectedCost, expectedTokens, expectedLatencyMs
├── expectedQuality, expectedConfidence
├── reasonForSelection
├── policyDecisions[], constraintDecisions[]
├── timestamp, version
```

## Unit Test Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| `engine.test.ts` | 4 | Full pipeline, explainability, decision record, leaderboards |
| `knowledge.test.ts` | 3 | Knowledge profile seeding, KB storage, registry integration |

**Total: 7 tests** — all passing without provider execution.

Run: `npx jest tests/platform/intelligence/model-intelligence`
