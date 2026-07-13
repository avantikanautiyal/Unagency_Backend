# Security Module

## Purpose

Security & Trust foundation for the Intelligence Platform.

## Responsibilities

- Define `IAuthorizationPolicy`, `IDataClassifier`, `IAuditLogger`, `ITrustGate`
- Define `SecurityContext`, `AuthorizationResult`, `AuditEvent`
- Provide M0 placeholder implementations (allow-all policy, console audit)

## Inputs

`SecurityContext`, authorization requests, audit events.

## Outputs

Authorization results, audit log side effects, classification labels.

## Dependencies

- `shared`
- `config` (classification defaults via composition root)

## Future Expansion

- Real policy-as-code
- PII detection pipelines
- Integration with existing Firebase/JWT auth at the gateway boundary

## What This Module MUST NOT Do

- Parse JWT tokens
- Integrate Firebase Authentication
- Replace business-platform auth
- Execute AI capabilities
