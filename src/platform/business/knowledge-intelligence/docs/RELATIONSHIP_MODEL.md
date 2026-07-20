# Relationship Model

## Semantics

A relationship is a versioned, weighted, typed edge between two existing entities
in the same organization.

| Field | Role |
|-------|------|
| `type` | Ontology relationship type (extensible) |
| `fromEntityId` / `toEntityId` | Endpoints (must exist) |
| `weight` | Traversal preference (higher = stronger) |
| `confidence` | Evidence confidence |
| `version` | Increments on each upsert of the same id |
| `changelog` | Required on every relationship mutation |

## Projection defaults

Brand Brain sync creates canonical edges such as:

- Organization `has_brand` Brand
- Brand `offers_product` Product
- Product `product_in_campaign` Campaign
- Campaign `campaign_targets` Audience
- Audience `audience_in_region` Region
- Brand `brand_has_tone` Tone
- Brand `differentiates_from` Competitor

Manual upserts may add edges Brand Brain does not natively store (FAQ, execution
links, landing pages, etc.).
