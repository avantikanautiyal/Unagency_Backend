# Brand Brain — Unit Tests

Suite: `tests/platform/business/brand-brain/brand-brain.test.ts`

| Case | Coverage |
|------|----------|
| Versioned store | upsert v1→v2, listVersions |
| Structured enrichment only | facts + flags no raw docs / no prompts |
| Org uniqueness | same query → different brand/tone facts |
| Domain retrieval | audience, competitors, campaigns, localization, history |
| Versioning | compare path diffs; rollback appends new tip |
| Explainability | 1:1 with facts; why / confidence / score |
| Missing brain | enrich fails closed |

Helpers: `setupBrandBrain`, `sampleBrandBrain`, builders under `testing/`.
