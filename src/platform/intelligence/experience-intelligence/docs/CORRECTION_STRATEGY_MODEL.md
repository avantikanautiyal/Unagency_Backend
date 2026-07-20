# Correction Strategy Model

## CorrectionStrategy

```typescript
interface CorrectionStrategy {
  readonly strategyId: string;
  readonly kind: CorrectionKind;
  readonly instruction: string;
  readonly rationale: string;
  readonly priority: "high" | "medium" | "low";
  readonly advisoryOnly: true;  // ALWAYS true
}
```

## Examples

| Root Cause | Correction |
|------------|-----------|
| weak_cta | Always include CTA |
| brand_mismatch | Use brand-aligned tone |
| hallucination | Increase knowledge grounding |
| poor_model_choice | Switch model |
| governance_block | Require human review |

## Critical Rule

Corrections **never modify prompts**. They are structured intelligence only.

## Location

`contracts/correction.ts`, `correction/correction-strategist.ts`
