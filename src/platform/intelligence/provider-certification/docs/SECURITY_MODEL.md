# Security Model

## Certification Areas

| Area | Validation |
|------|-----------|
| authentication_contract | Manifest declares authentication types |
| region_handling | Manifest declares supported regions |
| cost_reporting | Model cost metadata (optional, info) |

## Validators

`security/security-validator.ts` — no networking, manifest-only checks.

## Scorecard Dimension

`security` dimension aggregates authentication + region area scores.

## Future

Wire identity platform credential contracts when production auth validation is needed.

## Location

`security/security-validator.ts`
