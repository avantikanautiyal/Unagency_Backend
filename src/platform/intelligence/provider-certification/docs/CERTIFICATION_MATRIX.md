# Certification Matrix

## Capability Matrix

Maps manifest capabilities and adapter supported features.

```typescript
interface CapabilityMatrix {
  readonly capabilities: readonly MatrixCell[];
  readonly features: readonly MatrixCell[];
}
```

## Compliance Matrix

Per-area compliance across all 25 certification areas.

```typescript
interface ComplianceMatrix {
  readonly areas: readonly { area, compliant, score, issues }[];
  readonly overallCompliant: boolean;
}
```

## Performance Matrix

Benchmark scenario compatibility with estimated mock latency.

```typescript
interface PerformanceMatrix {
  readonly benchmarks: readonly { scenarioId, compatible, estimatedLatencyMs }[];
}
```

## Location

`contracts/matrices.ts`, `reporting/matrix-builder.ts`
