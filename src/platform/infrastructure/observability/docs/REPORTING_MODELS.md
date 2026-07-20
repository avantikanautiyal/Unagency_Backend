# Reporting Models

## Kinds

`daily` \| `weekly` \| `monthly` \| `organization` \| `provider` \|
`capability` \| `cost` \| `performance`

## Payload

`ObservabilityReport`: kind, period window, summary sections (costs, tokens,
latency, failures, health highlights), generatedAt.

Built by `generateReport(kind, periodStart, periodEnd)` from store data —
no external BI connector.
