# Execution Planner

Formerly the generic `planner` module — renamed for precision.

## Purpose

Transform a **Capability Request** into an **Execution Plan**.

Provider selection belongs **exclusively** to this module.

## Responsibilities

Decide:

- execution strategy
- provider selection and fallbacks
- retry strategy
- timeout
- budget
- evaluation strategy
- human review requirement
- execution policy references
- routing constraints

## Flow

```
Capability Request
        ↓
Execution Planner
        ↓
Capability Catalog          (metadata)
        ↓
Provider Capability Matrix  (what providers can do)
        ↓
Policies                    (constraints)
        ↓
Execution Plan
        ↓
Orchestrator (future)
```

## Inputs

`CapabilityRequest` (capability id + tenant scope — **never** a provider id from business modules).

## Outputs

`Result<ExecutionPlan>` only.

## Dependencies (interfaces only, future injection)

- `capability-catalog` (`ICapabilityCatalog`)
- `provider-capability-matrix` (`IProviderCapabilityMatrix`)
- `policies` (`IPolicyEngine`)
- `shared`

Must **not** depend on provider modules or SDKs.

## What This Module MUST NOT Do

- Execute AI
- Call provider SDKs
- Orchestrate multi-step runs
- Allow business modules to choose providers
- Mutate the capability catalog or matrix
