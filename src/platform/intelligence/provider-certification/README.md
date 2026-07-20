# Provider Certification Framework

Validates whether a provider adapter conforms to UNAGENCY standards before it becomes
available to Routing or Negotiation.

**Never calls external providers.** Operates on adapter contracts using mocks and test harnesses.

## Usage

```typescript
import {
  createProviderCertificationPlatform,
  CertificationRequestBuilder,
} from "./index";
import { FakeTextAdapter, makeManifest } from "../../providers/adapters/testing";

const { engine } = createProviderCertificationPlatform();
const adapter = new FakeTextAdapter(makeManifest());

const request = CertificationRequestBuilder.create()
  .withRequestId("cert_1")
  .withAdapter(adapter)
  .withManifest(adapter.describe().manifest)
  .build();

const result = await engine.certify(request);
if (result.ok) {
  console.log(result.value.status);        // certified | certified_with_warnings | rejected
  console.log(result.value.scorecard);     // dimensional scores
  console.log(result.value.badge);         // certification badge
}
```

## Certification Areas (25)

Request/response validation, streaming, tool/function calling, structured JSON, token
accounting, context window, error normalization, retry/timeout/circuit breaker/cancellation,
observability, logging, metrics, health, authentication, region, cost, manifest, model
discovery/metadata, diagnostics, performance.

## Outputs

- `ProviderCertificationReport`
- `CertificationScorecard`
- `CapabilityMatrix` / `ComplianceMatrix` / `PerformanceMatrix`
- `ProviderCertificationBadge`
- `ProviderCompatibilityProfile`
- `ProviderQualityReport`

See `docs/` for architecture review, diagrams, and ACP certification.
