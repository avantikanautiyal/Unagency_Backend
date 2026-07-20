# OpenAI Provider — Future Extension Report

## FE-OAI1 — Full SSE streaming parse

Expand `streaming/sse.ts` for true token-level streaming in live mode.

## FE-OAI2 — Responses API

Map to OpenAI Responses API alongside Chat Completions where appropriate.

## FE-OAI3 — Audio transcription / speech endpoints

Wire `/audio/transcriptions` and `/audio/speech` through the same adapter/SDK path.

## FE-OAI4 — Pricing from Live Catalog

Replace inferred pricing with vendor pricing feed when available.

## FE-OAI5 — Anthropic / Gemini clones

Copy OpenAI leaf structure: Manifest, SDK, Auth, Request/Response mappers, Model Resolver.

## Non-Goals (This Milestone)

- Anthropic / Gemini implementations
- Modifications to frozen platforms
- Hardcoded model selection in Intelligence OS
