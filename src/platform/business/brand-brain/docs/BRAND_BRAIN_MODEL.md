# Brand Brain Model

## Purpose

A **Brand Brain** is the versioned, structured knowledge pack for one
organization. It is the source of truth for enrichment.

## Top-level document (`BrandBrainDocument`)

| Area | Contents |
|------|----------|
| Organization profile | legal name, industry, size, regions, languages, summary |
| Brand identity | mission, vision, values, positioning, differentiators |
| Products / services | catalog with benefits and outcomes |
| Audiences / personas | segments, pains, goals, objections |
| Competitors | strengths, weaknesses, positioning notes |
| Tone of voice | adjectives, do/don't, sample phrases |
| Visual guidelines | palette, typography, imagery, logo |
| Campaign history | outcomes and lessons |
| Strategy memory | successful and failed strategies |
| Preferences | content preferences |
| Policies | compliance, marketing, approval, content rules |
| Localization | regional / language notes |
| Seasonality | seasonal themes and offers |
| Business goals | objectives aligned to planning |

## Lifecycle

1. **Upsert** — create version *n* with required changelog.
2. **Current tip** — latest version for enrichment by default.
3. **Get / list / compare** — audit and diff.
4. **Rollback** — re-materialize an older document as a **new** version tip
   (history preserved).

## Identity

- Scoped by `organizationId`.
- Optional `brandId` when multi-brand orgs prefer a brand slice.
- Each version has `versionId`, monotonic `version`, `createdAt`, `changelog`.
