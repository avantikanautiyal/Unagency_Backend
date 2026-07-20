# Unit / Integration Test Summary

## Suite

`tests/platform/production/production-validation.test.ts`

| Test | Type |
|------|------|
| Scenario library completeness (17 domains) | Unit |
| Retail full OS + OpenAI leaf | Integration |
| Empty requestId rejection | Unit |
| Failure analysis no auto-repair | Unit |
| Readiness score builder | Unit |
| Multi-scenario suite | Integration |
| Scenario lookup | Unit |

## Modes under test

Default: `openai_simulated` (real OpenAI leaf, no network).

Live OpenAI path enabled manually via `{ mode: "live", apiKey }` / `OPENAI_API_KEY`.
