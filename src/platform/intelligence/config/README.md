# Configuration Module

## Purpose

Centralized configuration for the Intelligence Platform. The only module allowed to read `process.env` for intelligence settings.

## Responsibilities

- Load and cache platform configuration
- Expose typed config surfaces for app, intelligence, providers, telemetry, security, knowledge, workflow, and evaluation
- Provide defaults suitable for local development

## Inputs

Environment variables (`INTELLIGENCE_*`, `NODE_ENV`).

## Outputs

`IntelligencePlatformConfig` and section-specific config objects.

## Dependencies

None (foundation leaf).

## Future Expansion

- Config validation schemas
- Hot-reload / remote config
- Per-tenant overrides

## What This Module MUST NOT Do

- Call AI providers
- Contain business logic
- Be bypassed by other modules reading `process.env` directly
- Load provider SDKs
