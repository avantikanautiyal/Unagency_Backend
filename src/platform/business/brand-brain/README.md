# Brand Brain & Organizational Intelligence

Proprietary enrichment layer under `src/platform/business/brand-brain/`.

Every execution is enriched with organization-specific knowledge **before** it
reaches the Intelligence Operating System. Structured context only — never raw
documents, never generated prompts.

## Boundary

```
Business / Gateway request
        ↓
  Brand Brain enrich()  →  structured EnrichmentPackage + explainability
        ↓
  metadata attached to execution request
        ↓
  Enterprise API Gateway → Intelligence OS (unchanged)
```

## Quick start

```ts
import {
  createBrandBrainPlatform,
  sampleBrandBrain,
  BrandBrainUpsertBuilder,
  BrandBrainRetrievalBuilder,
} from "./brand-brain"; // or from business package

const { engine } = createBrandBrainPlatform();

engine.upsert(
  BrandBrainUpsertBuilder.create()
    .withOrganization("org_a")
    .withDocument(sampleBrandBrain({ organizationId: "org_a", brandName: "Nova", ... }))
    .withChangelog("initial")
    .build()
);

const pack = engine.enrich(
  BrandBrainRetrievalBuilder.create()
    .forOrganization("org_a")
    .withCapability("marketing.copy")
    .withRegion("US")
    .build()
);

if (pack.ok) {
  const metadata = engine.toExecutionMetadata(pack.value);
  // pass metadata into GatewayExecutionClient.createExecution({ ..., metadata })
}
```

## Guarantees

| Guarantee | Enforcement |
|-----------|-------------|
| No raw documents in enrichment | `containsRawDocuments: false` |
| No prompt generation | `containsGeneratedPrompts: false` |
| Versioned updates | changelog-required upserts |
| Rollback / compare | `rollback`, `compare` |
| Explainability | one item per selected fact |
| OS unchanged | integrates via public Gateway metadata only |

## Layout

See directory tree under this module: `engine/`, `retrieval/`, `enrichment/`,
`versioning/`, domain folders, `contracts/`, `interfaces/`, `factories/`,
`testing/`, `docs/`.
