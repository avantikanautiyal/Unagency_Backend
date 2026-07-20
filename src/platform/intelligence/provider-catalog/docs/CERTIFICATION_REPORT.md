# Certification Report

## Gate

`evaluateCatalogCertification(GeneratedProviderPackage)`

### Pass criteria

1. All `REQUIRED_ARTIFACT_KINDS` present  
2. Discovery artifact contains discover path  
3. Model resolver exposes `DesiredCapabilityProfile`  
4. Non-empty `certificationChecklist` from generator planner  

### Outcomes

| Gate | Platform status |
|------|-----------------|
| Pass | `active` |
| Fail | `experimental` (never `active`) |

## Relation to full Provider Certification Framework

Catalog gate is the automatic pre-activation check for generated packages. Live adapter certification against the Provider Certification Framework remains available when concrete adapters + credentials exist — failure still cannot promote to ACTIVE.
