# M4.3 — Future Extension Report

The negotiation platform is designed so later milestones extend it **without
modifying existing code or breaking public contracts**.

## 1. New negotiators (Open/Closed)

Every stage is a port injected in `createNegotiationEngine()`. A new concern
(e.g. a `ISustainabilityNegotiator` for carbon budgets) is added by:

1. defining the port + contract,
2. implementing it,
3. wiring it in the factory / engine deps.

The engine orchestration and all existing negotiators stay untouched.

## 2. Richer model metadata (M-provider adapters)

`ModelNegotiator` derives capabilities from the matrix's 9 booleans +
`attributes`. When a real **model registry** arrives, swap the injected
`IModelNegotiator` for a registry-backed one — `deriveModelCompatibility()`
already isolates the mapping. `ModelCompatibility` fields are additive.

## 3. Real policy engine (M9 Enterprise Governance)

`IPolicyProvider` is the seam. `DefaultPolicyProvider` (allow-all + deny-list)
is replaced by an org/platform/ABAC policy engine. `PolicyNegotiator` and the
engine are unchanged; `PolicyEvaluation` accepts additional evidence additively.

## 4. Live provider health (M-observability)

`IProviderNegotiator` already reads `IProviderHealthStore`. A probe-driven store
plugs in with no negotiation changes. The `healthy` decision and
`requireHealthyProvider` profile flag are already wired.

## 5. Data residency & compliance (M-enterprise)

`RegionalEvaluation` is the extension point. Residency proofs, sovereignty
zones, and multi-region routing hints attach as additive fields; the regional
decision flow is unchanged.

## 6. Identity depth (M4.2 evolution)

`IIdentityNegotiator` consults `IProviderIdentityEngine` via interface only.
Delegation, impersonation, and attestation surface through the identity engine;
negotiation consumes `IdentityEvaluation` (trust level, permissions) without
learning secrets. A future "dry-run validation" (no session acquisition) is a
drop-in replacement for `IdentityNegotiator`.

## 7. Ranked alternatives / multi-candidate (M-orchestrator)

Today the engine negotiates the primary and lists usable fallbacks. A future
mode can run the full pipeline for every candidate and rank them by
`resolvePreferences()` weights. `NegotiationResult` can gain an additive
`alternatives` field; existing consumers keep working.

## 8. Streaming negotiation progress

`INegotiationEventPublisher` currently emits one terminal event. Per-stage
progress events are additive — publish more envelope types; no contract breaks.

## Non-goals (kept out by design)

- Execution, dispatch, routing — owned by M4.1 Runtime.
- Authentication, secret storage — owned by M4.2 Identity.
- Provider SDKs, transport, datastores — never enter this module.
