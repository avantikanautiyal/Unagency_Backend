# Telemetry Module

## Purpose

Metrics, logging, and distributed tracing foundation for the Intelligence Platform.

## Responsibilities

- Define `ITelemetry`, `IMetrics`, `ITracer`, `ISpan`, `ILogger`
- Define execution, cost, and token metric contracts
- Provide console-backed adapter for M0

## Inputs

Metric names, tags, execution metrics, log messages, span names.

## Outputs

Structured console output (M0). Future: OpenTelemetry export.

## Dependencies

- `shared`
- `config` (telemetry section, via composition)

## Future Expansion

- OpenTelemetry adapter
- SLO dashboards
- Anomaly detection hooks

## What This Module MUST NOT Do

- Own business logic
- Authorize requests
- Replace security audit logging
- Depend on provider SDKs
