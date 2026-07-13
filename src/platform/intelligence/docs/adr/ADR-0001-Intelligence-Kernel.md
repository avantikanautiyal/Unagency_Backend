# ADR-0001: Intelligence Kernel

## Status

Accepted

## Context

UNAGENCY needs an Intelligence Operating System embedded in the existing production backend. Future modules (capabilities, providers, workflows, agents) require a stable kernel for lifecycle, dependency injection, health, and configuration — without coupling to business modules or AI vendors.

## Decision

Introduce an `IntelligenceKernel` under `src/platform/intelligence/kernel` that owns:

- Bootstrap / start / shutdown lifecycle
- Lightweight in-process DI (`IServiceProvider`) without an external framework
- Composition root wiring for foundation services
- Health registration (`kernel/health` contracts)
- Platform registries (`kernel/registry`)
- Platform metadata (name, version, phase)

Business modules must not import kernel internals beyond an approved public façade in later milestones.

## Consequences

- Positive: Clear startup boundary; replaceable adapters; no AI coupling.
- Negative: Custom DI is minimal (no scopes/interceptors); may need extension later.
- Neutral: Kernel does not auto-start with Express in M0; explicit bootstrap is required when adopted.

## Alternatives Considered

- Use NestJS / Inversify: rejected to avoid framework migration of the existing Express app.
- Scatter lifecycle across modules: rejected due to inconsistent startup and circular risk.
