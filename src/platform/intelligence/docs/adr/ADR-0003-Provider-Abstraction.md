# ADR-0003: Provider Abstraction

## Status

Accepted (design); implementation deferred to M1+

## Context

External AI vendors are execution engines only. The platform must swap providers without changing business modules or capability contracts.

## Decision

- Providers implement a future `IAIProvider` port (not in M0).
- M0 only registers `ProviderDescriptor` placeholders in `IProviderRegistry`.
- No OpenAI, Anthropic, Gemini, or other SDKs are dependencies of the foundation.
- Configuration for providers is centralized in `config/providers.config.ts` but does not load SDKs.

## Consequences

- Positive: Clean adapter boundary; cost/routing policies can sit above providers.
- Negative: Real inference is unavailable until M1 provider adapters land.
- Neutral: In-memory registry is sufficient for M0 composition tests.

## Alternatives Considered

- Hardcode a single vendor SDK in business services: rejected.
- Use LangChain as the platform core: rejected (platform must own intelligence contracts).
