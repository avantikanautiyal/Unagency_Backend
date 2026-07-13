# Connectors Naming Decision

## Context

Task: review whether an `integrations` module should be renamed to `connectors`.

## Finding

The foundation platform under `src/platform/intelligence/` **does not include** an `integrations` module.

A prior architecture scaffold at repo-root `platform/intelligence/integrations` was removed as redundant (Task 0).

## Decision

- **No rename performed** — there is nothing to rename in the canonical tree.
- When external non-AI system adapters are introduced (Slack, Google Drive, HubSpot, Salesforce, Adobe, Shopify, Notion, Microsoft, etc.), the module **must be named `connectors`**.
- AI vendor adapters remain under a future **`providers`** module (leaf nodes), never under connectors.

## Rationale

| Name | Use |
|------|-----|
| `providers` | AI execution engines (OpenAI, Anthropic, …) behind `IAIProvider` |
| `connectors` | External business/SaaS systems |
| `integrations` | Avoided — ambiguous (AI vs SaaS vs internal) |

## Status

Accepted — deferred module creation until first connector is required.
