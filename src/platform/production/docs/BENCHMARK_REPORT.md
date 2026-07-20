# Benchmark Report

## Metrics collected

| Metric | Source |
|--------|--------|
| Provider latency | Runtime statistics / OpenAI dispatcher artifacts |
| Execution latency | Integration report `durationMs` |
| Prompt / completion tokens | Response usage or OpenAI metrics |
| Cost | Usage / estimated cost |
| Retry count | Runtime statistics |
| Streaming chunks | Runtime statistics |
| Evaluation score | Evaluation report summary |
| Human review required | Review disposition + score threshold |

Benchmarks are stored in `InMemoryProductionReportStore.listBenchmarks()`.
