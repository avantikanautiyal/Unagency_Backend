# ADR-0002: Capability Architecture

## Status

Accepted (design); implementation deferred to M1+

## Context

Intelligence work must be expressed as business capabilities (e.g. `analyzeBrief`, `generateMarketingCopy`), not as model-specific calls (`callGPT`, `callClaude`).

## Decision

- Capabilities are the unit of work.
- Kernel registries hold thin `CapabilityDescriptor` entries (registration presence).
- **Capability Catalog** holds full `CapabilityDefinition` planning metadata (configuration-driven).
- **Execution Planner** selects providers using catalog + provider capability matrix.
- Future execution flows: Gateway → Execution Planner → Orchestrator → Provider adapter.
- Agents and workflows may only request capabilities, never providers.

## Consequences

- Positive: Provider-independent business API; marketplace-ready naming.
- Negative: Requires routing/policy layer in M1 before any real execution.
- Neutral: Well-known capability names will be introduced when capabilities are implemented.

## Alternatives Considered

- Model-first API: rejected (vendor lock-in, leaks implementation details).
- Direct provider calls from business modules: rejected (violates platform boundary).
