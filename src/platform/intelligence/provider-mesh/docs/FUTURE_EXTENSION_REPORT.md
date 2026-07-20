# Future Extension Report — Provider Mesh

## Near term

1. Persistent mesh store (Redis / DB) replacing in-memory registry.
2. Streaming event ingestion with time-windowed EWMA smoothing.
3. SLO-aware scoring packs per org / region.
4. Wire `IRoutingMeshConsumer` once Routing unfreezes consumption ports.

## Medium term

1. Cross-region topology with latency tax in failover ranking.
2. Budget-aware capacity reservation signals for Execution Intelligence.
3. Canary statistical significance gates (A/B quality comparison metadata).
4. Shadow traffic correlation IDs for offline Evaluation Intelligence.

## Long term

Provider Mesh becomes the operational nervous system: continuous publish of
snapshots to Routing, Model Intelligence, Execution Intelligence, and Consensus
without owning execution.

## Explicitly deferred

- Live SDK health probes
- Auto-remediation (restarts, key rotation)
- Binding changes to frozen Routing/Runtime/Consensus modules
