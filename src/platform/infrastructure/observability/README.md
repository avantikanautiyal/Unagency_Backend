# Production Observability & AIOps Platform

Enterprise infrastructure for end-to-end operational visibility.

**Does not execute AI.** Observes API → Queue → Worker → Intelligence OS → Provider → Evaluation → Learning → Experience.

## Usage

```ts
import {
  createObservabilityPlatform,
  collectFromIntegrationReport,
} from "./index";

const { engine } = createObservabilityPlatform({ budgetLimit: 1000 });

engine.ingest(event);
engine.ingestMany(collectFromIntegrationReport(report, (p) => `${p}_${Date.now()}`));

engine.buildDashboard("executive");
engine.diagnose("corr_123");
engine.generateReport("daily", start, end);
```

## Docs

- [Architecture Review](./docs/ARCHITECTURE_REVIEW.md)
- [Implementation Report](./docs/IMPLEMENTATION_REPORT.md)
- [Observability Architecture](./docs/OBSERVABILITY_ARCHITECTURE.md)
- [Trace / Metrics / Cost / Token models](./docs/)
- [Dashboard / Alert / Health / Reporting models](./docs/)
- [Dependency Graph](./docs/DEPENDENCY_GRAPH.md)
- [Unit Test Summary](./docs/UNIT_TEST_SUMMARY.md)
- [ACP Report](./docs/ACP_REPORT.md)

## Non-goals

No OpenTelemetry / Prometheus / Grafana / Jaeger SDKs in this milestone.
