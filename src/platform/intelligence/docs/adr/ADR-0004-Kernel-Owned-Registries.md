# ADR-0004: Kernel-Owned Registries

## Status

Accepted

## Context

Registries for modules, capabilities, providers, workflows, agents, and plugins were initially a top-level `registry` module. In an OS-style architecture, registration is a kernel responsibility, not a peer service.

## Decision

Move all platform registries under `kernel/registry`. There is no top-level `registry` module.

The Kernel owns:

- Module Registry
- Capability Registry
- Provider Registry
- Workflow Registry
- Agent Registry
- Plugin Registry

## Consequences

- Positive: Clear ownership; composition root naturally wires registries; fewer top-level modules.
- Negative: Kernel surface area is larger (acceptable for an OS kernel).
- Neutral: Descriptor-only registrations remain; no execution logic in registries.

## Alternatives Considered

- Keep top-level registry: rejected (misplaced peer of kernel).
- Split each registry into its own top-level module: rejected (fragmentation).
