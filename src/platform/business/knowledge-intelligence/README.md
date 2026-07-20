# Knowledge Intelligence

Semantic organizational knowledge layer under `src/platform/business/knowledge-intelligence/`.

Brand Brain stores facts. Knowledge Intelligence understands **relationships**.

Never generates prompts. Never executes AI. Never uses LLM reasoning.

## Boundary

```
Brand Brain (source of truth)
        ↓  syncFromBrandBrain()
Knowledge Graph (entities + typed relationships)
        ↓  assembleContext()
Structured KnowledgeContextPackage + explainability
        ↓  toExecutionMetadata()
Enterprise API Gateway / Business execution metadata
        ↓
Intelligence OS (unchanged)
```

## Quick start

```ts
import {
  createKnowledgeIntelligencePlatform,
  KnowledgeSyncBuilder,
  KnowledgeRetrievalBuilder,
  sampleBrandBrain,
} from "./knowledge-intelligence";

const { engine } = createKnowledgeIntelligencePlatform();
const doc = sampleBrandBrain({ organizationId: "org_a", brandName: "Nova", ... });

engine.syncFromBrandBrain(
  KnowledgeSyncBuilder.create()
    .withOrganization("org_a")
    .withDocument(doc)
    .withBrandBrainVersion(1)
    .build()
);

const pack = engine.assembleContext(
  KnowledgeRetrievalBuilder.create()
    .forOrganization("org_a")
    .withProduct(doc.products[0].productId)
    .withRegion("US")
    .build()
);
```

## Guarantees

| Guarantee | Status |
|-----------|--------|
| Brand Brain remains SoT | Projection only |
| No prompts / raw docs / LLM reasoning | Metadata flags enforced |
| Extensible ontology | Custom entity/relationship types allowed |
| Versioned relationships + snapshots | Every mutation commits a snapshot |
| Explainable facts | 1:1 explainability items |

## Stop gate

This milestone ends when Knowledge Intelligence is complete. No frontend work.
