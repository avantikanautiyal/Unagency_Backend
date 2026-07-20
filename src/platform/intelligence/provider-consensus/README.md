# Provider Ensemble & Consensus Platform

Transforms **multiple provider execution results** into **one canonical result**.

Routing decides **who** executes.  
Consensus decides **how multiple executions become one**.

## Pipeline

```
Provider Results (OpenAI / Claude / Gemini / …)
  → Comparison
  → Conflict Arbitration
  → Strategy Decision
  → Optional Merge
  → Confidence + Explainability
  → ConsensusResult (canonical)
```

## Usage

```typescript
import {
  createProviderConsensusPlatform,
  sampleConsensusRequest,
} from "./index";

const { engine } = createProviderConsensusPlatform();
const report = await engine.decide(sampleConsensusRequest("best_quality"));

if (report.ok) {
  console.log(report.value.consensus.winningProviderId);
  console.log(report.value.consensus.mergedOutput);
  console.log(report.value.consensus.explanation);
}
```

## Strategies

Single winner, highest confidence, weighted voting, majority vote, best quality,
lowest cost, lowest latency, research+writing, reviewer, committee, hierarchical, hybrid.

## Outputs

`ConsensusResult` with winning provider, supporting providers, merged output,
canonical response, consensus score, confidence, alternatives, and explainability.

See `docs/` for architecture review and ACP report.
