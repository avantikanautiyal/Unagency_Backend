# Secret Management & Trust Platform

Enterprise infrastructure module for provider-independent secret management.

**Not** part of the Intelligence Operating System. Consumed by Provider Identity
and future integrations via configuration only.

## Providers

| Provider | Status |
|----------|--------|
| Local | Working |
| Environment | Working |
| AWS Secrets Manager | Placeholder interface |
| Azure Key Vault | Placeholder interface |
| Google Secret Manager | Placeholder interface |
| HashiCorp Vault | Placeholder interface |
| Kubernetes Secrets | Placeholder interface |

## Public API

`storeSecret` · `getSecret` · `updateSecret` · `deleteSecret` · `rotateSecret` ·
`leaseSecret` · `validateSecret` · `maskSecret` · `auditSecret` · `listSecrets` ·
`health` · (`revealLeasedSecret` for trusted adapters only)

## Usage

```ts
import { createSecretManagementPlatform } from "./index";
import { createIdentityPlatform } from "../../intelligence/providers/identity";

const secrets = createSecretManagementPlatform({ providerKind: "local" });
await secrets.manager.storeSecret({
  name: "openai-api-key",
  type: "ai_provider_key",
  value: process.env.OPENAI_API_KEY!,
});

// Additive Identity integration — no Identity redesign
const identity = createIdentityPlatform({
  secretProvider: secrets.asIdentitySecretProvider,
});
```

Changing `providerKind` to `aws_secrets_manager` (once SDK wired) requires
**configuration only** — callers keep using `ISecretManager`.

## Security

- Public `getSecret` returns masked/protected values only
- Plaintext reveal requires an active lease
- Audit logs never contain secret values
- AES-256-GCM local encryption with key versioning
