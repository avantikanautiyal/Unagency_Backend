# Provider Mesh Registration Report

## Mechanism

Each integrated provider publishes a `health` mesh event via `IProviderMeshEngine.observe()`:

- Certification status (`certified` | `experimental`)
- Latency / availability / error / success metrics
- Observability report with model inventory count, provider version, catalog department

## Observability attributes published

- Latency
- Availability
- Health event kind
- Errors / success rates
- Model inventory count
- Provider version
- Catalog department

## Non-goals

Mesh remains observe-only operational intelligence — catalog registration does not execute provider traffic.
