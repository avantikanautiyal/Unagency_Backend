# Organization Knowledge Model

## Principle

Knowledge is **typed domain objects**, not blobs. Enrichment serializes these
into `StructuredContextFact` records.

## Knowledge families

| Family | Contract types | Used for |
|--------|----------------|----------|
| Organization | `OrganizationProfileKnowledge` | industry, regions, languages |
| Identity | `BrandIdentityKnowledge` | mission, vision, values, positioning |
| Catalog | `ProductKnowledge`, `ServiceKnowledge` | offer fit to capability |
| Demand | `AudienceKnowledge`, `PersonaKnowledge` | targeting and messaging |
| Competition | `CompetitorKnowledge` | competitive framing |
| Expression | `ToneKnowledge`, `VisualGuidelinesKnowledge` | voice and brand safety |
| History | `CampaignHistoryEntry`, `StrategyMemory` | learn from past |
| Governance | `PolicyKnowledge` | compliance / approval |
| Market | `LocalizationKnowledge`, `SeasonalityKnowledge` | region and season |
| Strategy | `BusinessGoalKnowledge` | objectives alignment |

## Sections (`BrandBrainSection`)

Each fact tags a section enum (e.g. `brand_identity`, `tone`, `audience`,
`competitors`, `campaign_history`, `regional_preferences`,
`successful_strategies`, `failed_strategies`, `business_goals`, …).

## Storage note

V1.0 engine holds versions in memory for platform tests and composition.
Persistence adapters can map `BrandBrainVersionRecord` through existing
Enterprise Persistence repositories without changing this model.
