# Provider Consensus — Future Extension Report

## FE-PC1 — Execution Intelligence flags

Wire `IExecutionIntelligenceConsensusBridge`:

- `requireConsensus(requestId)`
- `requireSingleProvider(requestId)`

Interfaces only in this milestone.

## FE-PC2 — Semantic merge judges

Optional evaluation judges for merge quality verification.

## FE-PC3 — Streaming consensus

Incremental consensus as streaming chunks arrive.

## Non-Goals

- Provider integrations (Anthropic/Gemini)
- Runtime / routing / negotiation modifications
- Networking
