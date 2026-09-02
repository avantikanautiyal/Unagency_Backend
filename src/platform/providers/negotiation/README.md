# Provider Negotiation Platform (M4.3)

The Provider Negotiation Platform **decides whether a provider MAY execute a
request**. It is the last decision-making stage before the Provider Runtime.

It does **NOT**:

- execute providers,
- authenticate providers,
- call provider SDKs,
- perform routing / dispatch,
- persist anything, touch the network, or import vendor SDKs.

It **only negotiates**. Its output — a `NegotiatedExecution` — encodes every
execution decision so the runtime needs to make none.

```
ExecutionPlan
   ↓
Capability → Provider → Model → Constraint → Identity → Policy →
Feature → Budget → Regional → Quality
   ↓
Negotiation Decision
   ↓
NegotiatedExecution   ──►   Provider Runtime (M4.1)
```

## Quick start

```ts
import { createNegotiationEngine } from "./factories/create-negotiation-engine";
import { NegotiationRequestBuilder } from "./builders/negotiation-request-builder";

const engine = createNegotiationEngine({
  capabilityRegistry, // ICapabilityRegistry (M1)
  providerRegistry,   // IProviderRegistry (M1 provider platform)
  capabilityMatrix,   // IProviderCapabilityMatrix (M1)
  healthStore,        // optional IProviderHealthStore
  identityEngine,     // optional IProviderIdentityEngine (M4.2)
});

const request = new NegotiationRequestBuilder()
  .withPlan(executionPlan)
  .withOrganization(orgId)
  .withWorkspace(wsId)
  .withRequestedFeatures(["streaming", "functions"])
  .build();

const result = await engine.negotiate(request);
if (result.ok && result.value.negotiated) {
  // Project straight into the runtime contract:
  const runtimeRequest = projectToProviderExecutionRequest({
    negotiated: result.value.negotiated,
    executionId, organizationId, workspaceId, payload,
  });
}
```

## Decision semantics

| Outcome | Meaning |
| --- | --- |
| `accepted` | No warnings, no failures. `negotiated` present. |
| `accepted_with_warnings` | Soft issues only (e.g. immature capability, capped timeout). `negotiated` present. |
| `rejected` | At least one hard failure. `negotiated` is `undefined`. |

A **rejection is an expected outcome**, returned as `success(result)`. A `Result`
*failure* is reserved for malformed inputs (e.g. a request with no plan).

## Guarantees

- **Immutable contracts** — every public type is `readonly`; builders freeze output.
- **Interfaces everywhere / constructor injection** — every negotiator is a port.
- **Provider-independent** — nothing provider-specific beyond identifiers.
- **No side effects** — no persistence, no networking, no execution.
- **Secret-free** — identity is consulted via interface; no secret ever appears.

See `docs/` for the full architecture review, models, implementation report,
future-extension report, and ACPs.
