# Unit Test Summary — Provider Certification Framework

## Suite

`tests/platform/intelligence/provider-certification/engine.test.ts`

## Tests (6)

| Test | Assertion |
|------|-----------|
| certifies mock provider without external providers | Status certified, score ≥ 70, 9 suites, badge |
| produces report with scorecard and matrices | All matrices, 13 benchmarks, compatibility profile |
| issues certification badge | badgeId, providerId, score, certifiedAt |
| rejects adapter with invalid manifest | Status rejected/warnings for bad manifest |
| runs all suites with diagnostics | 9 suites, key areas present |
| never performs networking or SDK calls | Suites pass without external deps |

## Helpers

- `setupProviderCertificationPlatform()` — deterministic IDs/clock
- `sampleCertificationRequest()` — FakeTextAdapter + manifest
- `sampleMockAdapter()` — certified mock adapter

## Run

```bash
npx jest tests/platform/intelligence/provider-certification
npx jest tests/platform/intelligence
```
