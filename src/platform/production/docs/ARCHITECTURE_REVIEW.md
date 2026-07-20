# Production Validation — Architecture Review

## Verdict

Additive **Production Execution Validation Framework** under `src/platform/production/`.
Consumes Intelligence OS public APIs only. No redesign of Runtime, Routing,
Negotiation, Evaluation, Learning, Experience, or Provider Mesh.

## Layers

| Layer | Responsibility |
|-------|----------------|
| Scenarios | Deterministic business cases + expectations |
| Execution | Boot OpenAI leaf + Integration OS (`ProductionPinnedOpenAIDispatcher`) |
| Validation | Artifact / decision checks |
| Benchmarking | Latency, tokens, cost, retries, eval score |
| Certification | Execution / provider / capability / workflow / readiness |
| Diagnostics | Failure root-cause (no auto-repair) |
| Observability | Correlation + stage/bridge/provider timings |
| Reporting | In-memory store of validation + benchmark results |

## OpenAI

- Always uses the real OpenAI provider leaf (via `ProductionPinnedOpenAIDispatcher`)
- Never ControllableDispatcher
- Pinning remaps Routing’s chosen non-OpenAI model → discovered OpenAI model at the production boundary (validates OpenAI execution without editing Routing)
- Live mode: Identity Platform registers API key; `createOpenAIProvider({ mode: "live" })`
- CI mode: `openai_simulated` (same leaf, simulated transport)

## Non-goals

Redis, queues, Kubernetes, distributed deployment.
