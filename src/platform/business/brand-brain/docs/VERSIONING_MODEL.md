# Versioning Model

## Rules

1. Every upsert requires a non-empty `changelog`.
2. Versions are monotonic integers per `organizationId` starting at 1.
3. Prior versions are immutable.
4. **Rollback** does not delete history — it appends a new version whose
   document equals the target historical document.
5. **Compare** returns path-level `BrandBrainVersionDiff`
   (`changedPaths`, `addedPaths`, `removedPaths`).

## Record (`BrandBrainVersionRecord`)

| Field | Meaning |
|-------|---------|
| `versionId` | stable unique id |
| `organizationId` | owner |
| `version` | integer tip ordering |
| `label` | optional human label |
| `document` | full `BrandBrainDocument` snapshot |
| `createdAt` / `createdBy` | provenance |
| `changelog` | why this version exists |

## Enrichment pinning

Each `BrandBrainEnrichmentPackage` records `brainVersion` and `versionId` so
executions can audit which brain tip was used.
