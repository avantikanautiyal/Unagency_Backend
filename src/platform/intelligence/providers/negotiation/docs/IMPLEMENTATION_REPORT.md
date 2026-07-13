# M4.3 — Implementation Report

## 1. Public contracts (`contracts/`)

All immutable (`readonly`), no vendor specifics beyond identifiers.

| Contract | File | Notes |
| --- | --- | --- |
| `NegotiationRequest`, `ExecutionPreference`, `QualityRequirement` | `negotiation-request.ts` | Wraps an `ExecutionPlan` + tenant scope + preferences. |
| `NegotiatedExecution`, `FallbackCandidate` | `negotiated-execution.ts` | Primary output. |
| `NegotiationResult`, `NegotiationSummary`, `NegotiationProfile` | `negotiation-result.ts` | Engine return + config profile. |
| `NegotiationDecision` | `enums.ts` | `accepted` / `accepted_with_warnings` / `rejected`. |
| `NegotiationConstraint` | `negotiation-constraint.ts` | Per-constraint outcome. |
| `NegotiationWarning`, `NegotiationFailure`, `NegotiationEvidence` | `diagnostics.ts` | Diagnostics. |
| `CapabilityCompatibility`, `ProviderCompatibility`, `ModelCompatibility`, `FeatureCompatibility` | `compatibility.ts` | Analysis outputs. |
| `BudgetEvaluation`, `RegionalEvaluation`, `QualityEvaluation`, `PolicyEvaluation`, `IdentityEvaluation` | `evaluations.ts` | Evaluation outputs. |
| `ExecutionProfile` | `execution-profile.ts` | Final runtime settings (uses M4.1 `RetryPolicy`/`TimeoutPolicy`). |
| Enums: `NegotiationStage`, `NegotiableFeature`, `ConstraintKind`, `RiskLevel`, `PreferenceKind`, `MaturityLevel` | `enums.ts` | Closed unions. |

## 2. Interfaces (`interfaces/`)

- `IProviderNegotiationEngine`, `INegotiationEventPublisher`
- `ICapabilityNegotiator`, `IProviderNegotiator`, `IModelNegotiator`,
  `IFeatureNegotiator`, `IConstraintNegotiator`, `IPolicyNegotiator`,
  `IRegionalNegotiator`, `IQualityNegotiator`, `IBudgetNegotiator`,
  `IIdentityNegotiator`
- `IPolicyProvider` (consulted, never mutated)
- `NegotiationContext` (shared per-candidate input)

## 3. Implementations

| Subsystem | Folder | Class |
| --- | --- | --- |
| Capability analysis | `capability/` | `CapabilityNegotiator` |
| Provider analysis | `provider/` | `ProviderNegotiator` |
| Model analysis | `model/` | `ModelNegotiator` |
| Model capability mapping | `compatibility/` | `deriveModelCompatibility()` |
| Feature negotiation | `features/` | `FeatureNegotiator` |
| Constraint negotiation | `constraints/` | `ConstraintNegotiator` |
| Policy consultation | `policies/` | `PolicyNegotiator`, `DefaultPolicyProvider` |
| Budget negotiation | `budgeting/` | `BudgetNegotiator` |
| Quality negotiation | `quality/` | `QualityNegotiator` |
| Regional negotiation | `regional/` | `RegionalNegotiator` |
| Preference resolution | `preferences/` | `resolvePreferences()` |
| Decision / confidence | `negotiation/` | `decide()`, `computeConfidence()` |
| Identity consultation | `engine/` | `IdentityNegotiator` |
| Orchestration | `engine/` | `ProviderNegotiationEngine` |
| Event publishing | `engine/` | `Noop` / `EventBusNegotiationEventPublisher` |
| Builders | `builders/` | `NegotiationRequestBuilder`, `projectToProviderExecutionRequest()` |
| Factory | `factories/` | `createNegotiationEngine()` |
| Testing | `testing/` | fixtures + `setupNegotiation()` + fake registries |

## 4. Unit Test Summary

`tests/platform/intelligence/providers/negotiation/` — **30 tests, 6 suites, all passing.**

| Suite | Coverage |
| --- | --- |
| `negotiation.test.ts` | Happy-path acceptance, `NegotiatedExecution` shape, runtime projection, fallback candidates. |
| `capability-provider.test.ts` | Missing/disabled/experimental/incompatible capability; offline/excluded/unhealthy provider. |
| `model-feature.test.ts` | Missing profile, capability derivation, unsupported required feature, unknown feature string. |
| `constraint-budget-regional-quality.test.ts` | Timeout capping, budget ceilings, region allow/deny, risk-level tolerance. |
| `identity.test.ts` | Real M4.2 identity integration, required-but-missing, unresolved credential, warn-only. |
| `policy-confidence.test.ts` | Policy denial, plan policy refs, confidence/decision math, malformed-input `Result` failure. |

Full provider suite (M4.1 + M4.2 + M4.3): **132 tests passing.** No new TypeScript
errors; no lint errors in the module.

## 5. Rule compliance

| Rule | Status |
| --- | --- |
| Constructor injection only | ✅ every class |
| Interfaces everywhere | ✅ one port per negotiator |
| Immutable contracts | ✅ `readonly` + `Object.freeze` in builders |
| Builder pattern | ✅ `NegotiationRequestBuilder` |
| `Result<T>` | ✅ all negotiators + engine |
| No persistence | ✅ in-memory reads only |
| No provider SDKs | ✅ none imported |
| No networking | ✅ none |
| No execution | ✅ negotiation only |

## 6. Success criterion

`projectToProviderExecutionRequest()` maps a `NegotiatedExecution` directly to a
`ProviderExecutionRequest` (M4.1). Provider, model, retry, timeout, streaming,
and priority are all pre-decided — the runtime makes **no** further execution
decisions.
