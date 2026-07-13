# Future Extension Report — M3.3 Learning Intelligence Platform

## Near-term

| Extension | Approach |
|-----------|----------|
| A/B testing | Implement `IExperimentManager` with shadow traffic |
| Shadow evaluation | Compare recommendations against live outcomes |
| Regression testing | Artifact replay through learning pipeline |
| Clustering | Implement `IClusteringEngine` for signal grouping |
| Ranking strategies | Pluggable `IRankingStrategy` implementations |

## ML / online learning (out of scope for M3.3)

- ML model training belongs in external infrastructure
- Online learning requires persistence and feedback loops
- Learning Engine emits `LearningArtifact` via Artifact Platform (future)

## Optimization

`IOptimizationEngine` remains interface-only until explicit human approval workflow exists. **No automatic module modification.**

## Integration

```
Artifact snapshots (historical)
  → ILearningIntelligenceEngine.learn()
  → LearningResult
  → LearningArtifact (via ArtifactEngine, future)
  → Human review / policy gates (external)
```

## Out of scope

- Provider SDK analysis
- Database-backed analytics
- HTTP APIs
- Reinforcement learning
