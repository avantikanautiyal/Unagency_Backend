# Scorecard Model

## Dimensions

| Dimension | Weight | Areas |
|-----------|--------|-------|
| compatibility | 2 | request/response validation, manifest |
| streaming | 1 | streaming |
| tool_calling | 1 | tool + function calling |
| json | 1 | structured JSON output |
| reliability | 2 | error normalization, retry, timeout |
| observability | 1 | observability, health, diagnostics |
| security | 1 | authentication, region |
| performance | 1 | performance, token accounting |
| overall | — | weighted aggregate |

## Schema

```typescript
interface CertificationScorecard {
  readonly dimensions: readonly DimensionScore[];
  readonly overallScore: number;      // 0–100
  readonly passingThreshold: number;    // default 70
  readonly passed: boolean;
}
```

## Scoring

Per-suite score = `maxScore - (errors × 10) - (warnings × 3)`

Overall = weighted average of dimension scores.

## Location

`contracts/scorecard.ts`, `scorecards/scorecard-builder.ts`
