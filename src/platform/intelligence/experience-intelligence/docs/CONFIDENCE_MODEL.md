# Confidence Model

## ExperienceScores

```typescript
interface ExperienceScores {
  readonly confidence: number;
  readonly evidenceScore: number;
  readonly impactScore: number;
  readonly reuseScore: number;
  readonly improvementScore: number;
  readonly applicabilityScore: number;
}
```

## Confidence Factors

| Factor | Weight |
|--------|--------|
| Success rate | 30% |
| Evidence quality | 25% |
| Human approval | 20% |
| Recency | 15% |
| Base confidence | 10% |

## Lifecycle Threshold

- confidence >= 0.7 → `validated`
- confidence < 0.7 → `draft`

## Location

`contracts/scoring.ts`, `confidence/confidence-engine.ts`
