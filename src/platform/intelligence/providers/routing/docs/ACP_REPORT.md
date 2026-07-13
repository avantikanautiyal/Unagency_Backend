# M4.8 Routing Platform — ACP Report

## ACP-R1 — Auto-candidate discovery from Integration (LOW)

Wire `createRoutingPlatform` with optional `IProviderDiscoveryEngine` to build
candidates from activated providers automatically.

## ACP-R2 — Negotiation fallback seeding (LOW)

Merge `NegotiatedExecution.fallbackCandidates` into routing fallbacks post-rank.

## ACP-R3 — Live health from execution telemetry (INFORMATIONAL)

History/health currently in-memory; future milestone feeds from execution events
without importing runtime execution.

**Recommendation:** Proceed. M4.8 ready to freeze.
