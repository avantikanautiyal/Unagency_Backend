# Kernel Registry

## Purpose

Kernel-owned registries for platform components. The Kernel is the sole owner of registration.

## Responsibilities

- Module Registry
- Capability Registry
- Provider Registry
- Workflow Registry
- Agent Registry
- Plugin Registry

Descriptors only in the foundation phase — no execution logic.

## Inputs

Descriptors (`ModuleDescriptor`, `CapabilityDescriptor`, etc.).

## Outputs

Registered descriptors and lookup results via `Result`.

## Dependencies

- `shared` only

## Future Expansion

- Persistent registries
- Tenant-scoped registries
- Marketplace discovery

## Related (do not confuse)

| Module | Role |
|--------|------|
| **capability-catalog** | Full capability planning metadata |
| **provider-capability-matrix** | What each provider can do (features) |
| **kernel/registry** | Registration presence of components |

## What This Module MUST NOT Do

- Exist as a top-level platform module (owned by Kernel)
- Execute capabilities or providers
- Load AI SDKs
- Own planning metadata (use capability-catalog)
- Own provider feature matrices (use provider-capability-matrix)
- Contain workflow/agent runtime logic
