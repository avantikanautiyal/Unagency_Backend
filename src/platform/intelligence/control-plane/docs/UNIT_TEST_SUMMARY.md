# Unit Test Summary — Intelligence Control Plane

## Suite

`tests/platform/intelligence/control-plane/engine.test.ts`

## Tests (6)

| Test | Assertion |
|------|-----------|
| produces ExecutionReadyPlan for sneaker launch | Full plan with all 8 stage outputs; 8 stages executed |
| maintains artifact chain through all stages | Task → Team → Workflow → Governance → EI → Model → Negotiation → Routing → Ready |
| collects diagnostics with stage timings | 8 timings, validation passed |
| produces unified explainability report | Summary + per-domain rationales + 8 stage summaries |
| supports dry-run simulation mode | `providerExecution: false`, 8 stages simulated |
| never passes RawRequest to downstream stages | EI and MI use capability-derived inputs |

## Test Helpers

- `setupIntelligenceControlPlane()` — deterministic `createId`, `nowIso`, `clockMs`
- `sampleSneakerLaunchControlPlaneRequest()` — `"Launch our new sneaker collection"`

## Full Suite Impact

| Before M6 | After M6 |
|-----------|----------|
| 498 tests | 504 tests (+6) |

All 115 intelligence test suites pass.

## Run

```bash
npx jest tests/platform/intelligence/control-plane
npx jest tests/platform/intelligence
```
