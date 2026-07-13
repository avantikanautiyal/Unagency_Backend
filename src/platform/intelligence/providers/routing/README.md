# Provider Routing & Decision Engine (M4.8)

Enterprise **routing and decision** layer. Decides which provider(s) should execute a
capability request — **never executes providers**.

> No OpenAI/Anthropic/Gemini integrations. No networking. No execution.

## Pipeline

```
RoutingRequest → filter (compliance/preferences) → score → rank (strategy)
  → failover chain → experiments (canary/shadow) → RoutingPlan / RoutingDecision
```

## Quick start

```ts
import { createRoutingPlatform, RoutingRequestBuilder } from ".../providers/routing";
import { makeTenCandidates } from ".../providers/routing/testing";

const { engine } = createRoutingPlatform();

const request = RoutingRequestBuilder.create()
  .withRequestId("route_1")
  .withCapabilityId(capabilityId)
  .withCandidates(makeTenCandidates())
  .withStrategy("balanced")
  .build();

const decision = await engine.route(request);
// decision.value.plan.primary, decision.value.plan.fallbacks, decision.value.scores
```

## Strategies

`lowest_cost`, `lowest_latency`, `highest_quality`, `provider_preference`,
`compliance`, `health_first`, `balanced`, `weighted`, `random`, `sticky`,
`canary`, `shadow`, `multi_provider`

See [`docs/`](./docs) for architecture review, scoring model, failover, and ACPs.
