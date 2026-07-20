# Trace Model

## Identifiers

| Field | Role |
|-------|------|
| `correlationId` | Cross-system request identity (required) |
| `traceId` | Causal tree root |
| `spanId` | Single unit of work |
| `parentSpanId` | Nesting within a trace |
| `executionId` | Job / request execution key |

## Span

`TraceSpan`: name, `ObservedSurface`, status (`ok` \| `error` \| `cancelled`),
timestamps, `durationMs`, `TelemetryContext`, optional attributes / error.

## Pipeline coverage

```
API → Queue → Worker → Integration → Intelligence stages
  → Provider / Runtime → Evaluation → Learning → Experience
```

Collectors derive child spans from Integration stage traces so a single
correlation ID reconstructs the path.
