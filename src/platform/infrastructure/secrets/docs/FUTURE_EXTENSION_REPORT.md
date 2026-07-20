# Future Extension Report

| Extension | Notes |
|-----------|--------|
| AWS Secrets Manager SDK | Replace `AwsSecretsManagerBackend` placeholder |
| Azure Key Vault SDK | Same pattern |
| GCP Secret Manager SDK | Same pattern |
| HashiCorp Vault client | Same pattern |
| Kubernetes Secret API | Same pattern |
| Redis cache | Implement `ISecretCache` |
| Cloud KMS | Envelope encryption with external CMK |
| HSM / PKCS#11 | New encryptor |
| Multi-region replication | Backend concern |

Caller contracts (`ISecretManager`) remain stable.
