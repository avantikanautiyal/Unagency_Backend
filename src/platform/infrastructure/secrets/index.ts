/**
 * Enterprise Secret Management & Trust Platform.
 *
 * Provider-independent secret storage for UNAGENCY infrastructure.
 * Consumed by Provider Identity via additive ISecretProvider adapter.
 */

export * from "./contracts";
export * from "./interfaces";
export * from "./constants";
export { SecretManagerEngine } from "./engine/secret-manager-engine";
export { LocalSecretBackend } from "./local/local-secret-backend";
export { EnvironmentSecretBackend } from "./environment/environment-secret-backend";
export {
  AwsSecretsManagerBackend,
  AzureKeyVaultBackend,
  GcpSecretManagerBackend,
  HashicorpVaultBackend,
  KubernetesSecretsBackend,
} from "./providers/placeholder-backends";
export { LocalAes256Encryptor } from "./encryption/local-aes256-encryptor";
export { InMemorySecretCache } from "./caching/in-memory-secret-cache";
export { InMemorySecretAuditor } from "./auditing/secret-auditor";
export { maskSecretValue, maskSecret, scrubObject } from "./masking/secret-masker";
export { SecretLeaseManager } from "./leasing/lease-manager";
export { StoreSecretInputBuilder } from "./builders/store-secret-input-builder";
export {
  SecretManagerIdentityAdapter,
  asIdentitySecretProvider,
} from "./identity/secret-manager-identity-adapter";
export {
  createSecretManagementPlatform,
  type SecretManagementPlatform,
  type CreateSecretManagementOptions,
} from "./factories/create-secret-management-platform";
