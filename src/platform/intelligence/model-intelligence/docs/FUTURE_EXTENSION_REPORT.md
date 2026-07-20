# Model Intelligence Platform — Future Extension Report

## Extension Points (Not Implemented)

| Extension | Interface / Contract | Integration Point |
|-----------|---------------------|-------------------|
| Live Provider Benchmarks | `IBenchmarkRepository` | Replace in-memory with benchmark runner |
| Public Leaderboards | `ILeaderboardEngine` | External leaderboard sync |
| OpenRouter Statistics | `DynamicScoreInput` | Telemetry ingestion |
| Artificial Analysis | `IBenchmarkRepository` | External benchmark import |
| HELM | `BenchmarkCategory` | Add HELM category scores |
| SWE-bench | `BenchmarkCategory` | Coding benchmark overlay |
| MMLU | `BenchmarkCategory` | Reasoning benchmark overlay |
| Live Telemetry | `ScoreSourceKind.production_telemetry` | Scoring engine inputs |
| Human Ratings | `ScoreSourceKind.customer_feedback` | Knowledge base upsert |
| A/B Tests | `ModelIntelligenceInputs` | Trend analyzer |
| Shadow Runs | `ISimulationEngine` | Dry-run vs production compare |

## Model Knowledge Base Evolution

When providers are integrated:

1. **Add or update** `ModelKnowledgeProfile` entries — no ranking logic redesign
2. **Ingest** live benchmark results into `IBenchmarkRepository`
3. **Merge** telemetry into `DynamicScoreInput` for weighted scoring
4. **Publish** leaderboards to external surfaces via `ILeaderboardEngine`

## Recommended Next Steps

1. Wire `DynamicScoreInput` from Evaluation and Learning platforms
2. Add persistence layer for knowledge base and benchmark history
3. Connect `ModelDecisionRecord` to Artifact Platform export
4. Feed `RankedModelCandidates` into frozen Negotiation platform
5. Optional: domain-specific analyzers (`reasoning/`, `coding/`, etc.) as thin
   wrappers over `ICapabilityAnalyzer` when specialization is needed

## Non-Goals (This Milestone)

- Provider execution, SDKs, HTTP, networking
- Modifications to Negotiation or Routing
- Live benchmark runs against vendor APIs
