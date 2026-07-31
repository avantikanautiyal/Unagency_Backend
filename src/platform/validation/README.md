# Production Validation Platform (M9.1)

Orchestrates end-to-end testing, verification, reporting, and production readiness certification for UNAGENCY. This platform **consumes** existing modules only — it does not redesign Intelligence OS, Gateway APIs, Execution Intelligence, Brand Brain, or Knowledge Intelligence.

## Structure

| Module | Purpose |
| --- | --- |
| `orchestrator/` | Scenario runner and validation orchestrator |
| `suites/` | Predefined validation suite groupings |
| `scenarios/` | E2E journey stage graphs |
| `assertions/` | Reusable check helpers |
| `reports/` | Markdown report generation |
| `coverage/` | API and module coverage tracking |
| `benchmarking/` | Performance metric aggregation |
| `health/` | Platform health probes |
| `diagnostics/` | Failure summarization |
| `load/` | Configurable load testing |
| `recovery/` | Recovery path validation |
| `certification/` | Production readiness scoring |
| `failure/` | Failure simulation catalog |
| `security/` | JWT, RBAC, isolation, leakage tests |

## Usage

```typescript
import { setupValidationPlatform, sampleValidationRunRequest } from "./platform/validation/testing";

const { orchestrator } = await setupValidationPlatform();
const bundle = await orchestrator.runWithReports(
  sampleValidationRunRequest({ scenarioIds: ["gateway_e2e", "campaign_generation"] })
);

if (bundle.ok) {
  console.log(bundle.value.certificationReportMd);
}
```

## Reports

`runWithReports()` generates:

- `VALIDATION_REPORT.md`
- `END_TO_END_REPORT.md`
- `SECURITY_REPORT.md`
- `LOAD_TEST_REPORT.md`
- `FAILURE_REPORT.md`
- `RECOVERY_REPORT.md`
- `PERFORMANCE_REPORT.md`
- `COVERAGE_REPORT.md`
- `CERTIFICATION_REPORT.md`

## Scenarios

- **Campaign Generation** — full marketing pipeline
- **Website Generation** — page, SEO, brand adaptation
- **Landing Page** — retrieval, execution, explainability
- **Logo Generation** — image routing, cost, storage
- **Research Merge** — Perplexity, Exa, Tavily catalog paths
- **Gateway E2E** — API through explainability endpoints

## Constraints

- No modifications to frozen platform layers
- No new Gateway routes or business logic
- Validation and certification only
