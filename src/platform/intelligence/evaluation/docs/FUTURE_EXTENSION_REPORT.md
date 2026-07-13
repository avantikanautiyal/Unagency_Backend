# Future Extension Report — M3.1 Intelligence Evaluation Platform

## Near-term

| Extension | Approach |
|-----------|----------|
| LLM judges | Implement `IJudge` adapters behind feature flags — never inline in engine |
| Rubric registry | `IRubricResolver` backed by versioned store |
| Report persistence | Repository port behind `EvaluationReport` — no engine changes |
| Human review workflow | Consume `ReviewDecision` in external workflow module |

## Calibration (M3+)

- Implement `ICalibrationStore` + `ICalibrationEngine` with offline sample ingestion
- Apply criterion offsets without mutating frozen judge contracts
- **No learning loop in evaluation** — feed calibrated reports to Learning Engine

## Comparison

- Implement `IOutputComparator` for regression and A/B evaluation
- Support baseline snapshots from memory artifacts

## Confidence

- Add provider-agnostic uncertainty signals (token entropy proxies, citation coverage)
- Keep confidence separate from quality scoring

## Integration points

```
EvaluationResult
  → memory.ingest (classification: evaluation)
  → learning engine (future)
  → gateway post-execution hook (future)
```

## Out of scope for evaluation module

- Provider SDK judging
- Real-time human review UI
- Online model training
- Database drivers
