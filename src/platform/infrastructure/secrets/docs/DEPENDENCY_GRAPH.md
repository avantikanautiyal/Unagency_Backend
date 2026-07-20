# Dependency Graph

```
SecretManagementPlatform
 ├─ SecretManagerEngine
 │   ├─ ISecretBackend (local | environment | placeholders)
 │   ├─ ISecretEncryptor (LocalAes256Encryptor)
 │   ├─ ISecretCache (InMemorySecretCache → future Redis)
 │   ├─ ISecretAuditor
 │   ├─ ISecretMonitor
 │   └─ SecretLeaseManager
 └─ SecretManagerIdentityAdapter → Identity ISecretProvider (inject only)

Intelligence OS modules: NOT dependencies (except shared Result/Error utilities).
```
