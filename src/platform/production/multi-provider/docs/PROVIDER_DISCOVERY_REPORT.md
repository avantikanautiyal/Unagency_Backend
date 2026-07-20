# Provider Discovery Report

## Mechanism

Every generated package includes dynamic `discoverModels()` artifacts from the
Universal Provider Generator. Catalog runtime bootstraps inventory from the
official spreadsheet until live API discovery is enabled.

## Per-provider discovery record

| Field | Source |
|-------|--------|
| `discoveryEndpoint` | Catalog seed |
| `authScheme` | Manifest authentication type |
| `secretEnvHint` | Catalog `envVarHint` (Secret Management compatible) |
| `modelCount` | Bootstrap / live inventory |
| `source` | `catalog_bootstrap` \| `cache` \| `live` |

## Status

All 34 providers report successful bootstrap discovery (`ok: true`) after rollout.
Live HTTP discovery remains provider-API gated and additive.
