# Capability Bundle Model

A **CapabilityBundle** packages selected capabilities for reuse:

- `bundleId`, `name`, `version`
- `capabilityIds` (topological)
- `graph` (`CapabilityGraph`)
- `members` (full `CapabilityDefinitionRecord`s)
- `reusable` flag when multi-capability

Bundles feed the `CapabilityExecutionPlan` and downstream (future) consumers.
They never bind providers.
