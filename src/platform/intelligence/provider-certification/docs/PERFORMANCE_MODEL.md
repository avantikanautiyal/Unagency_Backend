# Performance Model

## Overview

Performance certification uses mock latency estimates — no real provider execution.

## Suite

`performance` suite validates adapter reports supported features.

## Performance Matrix

Each benchmark scenario receives:
- `compatible` — feature interface match
- `estimatedLatencyMs` — mock estimate (50ms when compatible)

## Quality Report

`ProviderQualityReport.qualityScore` = percentage of compatible benchmark scenarios.

## Location

`conformance/manifest-validator.ts` (validatePerformance)
`scenarios/benchmark-catalog.ts`
`reporting/matrix-builder.ts`
