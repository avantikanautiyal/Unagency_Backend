# Retrieval Model

## Query (`BrandBrainRetrievalQuery`)

Retrieval is **query-driven scoring**, not full-document dump.

| Dimension | Field | Effect |
|-----------|-------|--------|
| Capability | `capabilityId` | boosts catalog / tone / policies relevant to capability |
| Department | `department` | preference for related sections |
| Campaign | `campaignId` | elevates matching campaign history |
| Brand | `brandId` | brand-scoped facts |
| Audience | `audienceId` | audience + personas |
| Market | `market` | market / competitor framing |
| Product | `productId` | product proof points |
| Region | `region` | localization / regional preferences |
| History | `includeHistoricalPerformance` | strategies + campaign lessons |
| Objectives | `includeObjectives` | business goals |
| Prefer | `preferSections` | soft bias to named sections |

## Algorithm (`retrieveCandidates`)

1. Expand the current Brand Brain document into candidate facts by section.
2. Score each candidate against query dimensions.
3. Rank and select high-relevance facts (confidence retained from source).
4. Pass selection into enrichment packaging.

## Guarantees

- Missing Brand Brain → enrichment fails with not-found (no silent empty invent).
- No retrieval of opaque binary or raw document bodies.
- Selection is explainable (score + why).
