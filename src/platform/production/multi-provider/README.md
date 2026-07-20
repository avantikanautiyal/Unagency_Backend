# Multi-Provider Production Rollout

Transforms the Intelligence OS from capability-driven bootstrap into an
**evidence-driven** multi-provider production posture.

## Rules

- Every Official Provider Catalog entry is integrated **exclusively** via the Universal Provider Generator.
- OpenAI continues to use the frozen `existingLeaf`; it still passes through the generator for certification parity.
- No Intelligence OS / Runtime / Routing / Negotiation / Evaluation / Learning redesign.
- Benchmark evidence is published with complete execution fields for downstream consumers.

## Usage

```ts
import { createMultiProviderRolloutPlatform } from "./index";

const { engine } = createMultiProviderRolloutPlatform();
const report = await engine.rollout({ requestId: "rollout_v1" });
```

## Docs

1. [Multi-Provider Integration Report](./docs/MULTI_PROVIDER_INTEGRATION_REPORT.md)
2. [Provider Discovery Report](./docs/PROVIDER_DISCOVERY_REPORT.md)
3. [Model Inventory Report](./docs/MODEL_INVENTORY_REPORT.md)
4. [Capability Mapping Report](./docs/CAPABILITY_MAPPING_REPORT.md)
5. [Runtime Registration Report](./docs/RUNTIME_REGISTRATION_REPORT.md)
6. [Certification Report](./docs/CERTIFICATION_REPORT.md)
7. [Benchmark Readiness Report](./docs/BENCHMARK_READINESS_REPORT.md)
8. [Production Validation Report](./docs/PRODUCTION_VALIDATION_REPORT.md)
9. [Unit Test Summary](./docs/UNIT_TEST_SUMMARY.md)
10. [ACP Report](./docs/ACP_REPORT.md)

## Success criteria

Same capability across providers · Routing choice · Consensus · Evaluation compare · Learning compare · Evidence-ready recommendations
