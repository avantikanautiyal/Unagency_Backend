# Kernel Health

## Purpose

Health architecture for the Intelligence Platform kernel.

## Responsibilities (contracts)

- `IHealthCheck` — single check unit
- `IHealthRegistry` — register and run checks
- `IHealthMonitor` — continuous monitoring (future)
- `IHealthStatus` — named status snapshot
- `PlatformHealth`, `ProviderHealth`, `CapabilityHealth`

## Inputs

Registered health checks.

## Outputs

`PlatformHealth` reports.

## Dependencies

- `shared` (HealthStatus enum)

## Future Expansion

- Provider and capability health probes
- Periodic monitoring via scheduler
- Alerting integrations

## What This Module MUST NOT Do

- Call AI providers
- Implement provider/capability execution
- Depend on business modules
- Own HTTP health endpoints (app layer concern)
