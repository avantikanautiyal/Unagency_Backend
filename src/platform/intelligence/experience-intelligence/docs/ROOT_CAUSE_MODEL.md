# Root Cause Analysis Model

## RootCause

```typescript
interface RootCause {
  readonly causeId: string;
  readonly kind: RootCauseKind;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
}
```

## RootCauseKind Values

weak_cta, brand_mismatch, hallucination, wrong_reasoning_strategy, wrong_workflow,
wrong_agent_role, prompt_ambiguity, missing_context, insufficient_knowledge,
incorrect_capability, poor_model_choice, budget_restriction, governance_block,
latency_exceeded, cost_overrun, unknown

## Detection Sources

- Failed evaluation criteria → brand_mismatch, weak_cta, hallucination
- Low observability success rate → poor_model_choice, latency_exceeded
- Human artifact feedback → prompt_ambiguity

## Location

`contracts/root-cause.ts`, `root-cause/root-cause-analyzer.ts`
