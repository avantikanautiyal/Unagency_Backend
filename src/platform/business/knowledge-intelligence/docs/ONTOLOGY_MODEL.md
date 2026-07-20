# Ontology Model

## Core entity types

Organization, Brand, Product, Service, Audience, Persona, Campaign, Asset,
Document, Competitor, Market, Region, Department, Workflow, Policy, FAQ,
Support Case, Legal Rule, Landing Page, Website, Social Channel, Execution,
Evaluation, Experience, Template, Tone, Strategy, Goal.

Custom string types remain allowed.

## Relationship catalog

Documented examples (extensible):

| Type | From → To |
|------|-----------|
| `product_in_campaign` | Product → Campaign |
| `campaign_targets` | Campaign → Audience |
| `audience_in_region` | Audience → Region |
| `brand_has_tone` | Brand → Tone |
| `execution_evaluated_by` | Execution → Evaluation |
| `execution_yielded_experience` | Execution → Experience |
| `campaign_uses_asset` | Campaign → Asset |
| `product_has_faq` | Product → FAQ |
| `competitor_in_market` | Competitor → Market |
| `landing_page_for` | Landing Page → Product |
| `support_case_about` | Support Case → Product |
| `legal_rule_constrains` | Legal Rule / Policy → Campaign / Brand / Product |

See `ontology/ontology.ts` for the full catalog and default weights.
