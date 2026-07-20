# Audit Model

Every mutating/accessing operation writes a `SecretAuditEvent`:

- Who (`actor`)
- When (`at`)
- Why (`reason` / purpose)
- Result (`outcome`)
- Duration (`durationMs`)
- Rotation / lease / validation metadata

**Never** includes plaintext secrets. Metadata is scrubbed via `scrubObject`.
