# Cost Intelligence Model

## Record

`CostRecord`: amount, currency, timestamp, `TelemetryContext`, optional
provider / model / capability / department dimensions.

## Aggregations (`aggregateCosts`)

- Per organization, department, capability, provider, model
- Total and record count
- `projectedMonthly` from observed spend rate
- Optional `budgetUsagePercent` when `budgetLimit` is configured

## Cadence

Dashboards and reports roll windows (daily / weekly / monthly) over the same
records — no separate warehouse in this milestone.
