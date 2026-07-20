# Enrichment Model

## Output (`BrandBrainEnrichmentPackage`)

Structured package attached to an execution request as metadata.

| Field | Role |
|-------|------|
| `enrichmentId` | correlation id |
| `organizationId` / `brandId` | scope |
| `brainVersion` / `versionId` | pinned brain |
| `query` | retrieval query used |
| `facts` | `StructuredContextFact[]` |
| `explainability` | parallel selection rationale |
| `summary` | fact count, sections, avg confidence |

## Fact (`StructuredContextFact`)

```
factId, section, key, value, relevance, confidence, sourceRef
```

`value` is typed JSON-compatible structured data (string, string list, or object)
— never a free-form prompt template, never a raw markdown dump of the brain.

## Metadata bridge (`toExecutionMetadata`)

Produces Gateway-safe metadata:

- `brandBrain.facts` — selected facts
- `brandBrain.explainability` — rationale
- `brandBrain.containsRawDocuments: false`
- `brandBrain.containsGeneratedPrompts: false`
- version + summary fields

Business / Gateway may pass this object into execution creation. Intelligence OS
consumes request context as today — **no OS redesign**.

## Hard bans

| Ban | Reason |
|-----|--------|
| Raw documents | leakage / non-deterministic OS input |
| Generated prompts | Brand Brain is not a prompt engine |
