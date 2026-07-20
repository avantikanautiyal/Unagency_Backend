/**
 * Secret Management Platform factory.
 */

import type { ISecretManager, ISecretBackend } from "../interfaces/secrets";
import { SecretManagerEngine } from "../engine/secret-manager-engine";
import { LocalSecretBackend } from "../local/local-secret-backend";
import { EnvironmentSecretBackend } from "../environment/environment-secret-backend";
import { LocalAes256Encryptor } from "../encryption/local-aes256-encryptor";
import { InMemorySecretCache } from "../caching/in-memory-secret-cache";
import { InMemorySecretAuditor } from "../auditing/secret-auditor";
import { DefaultSecretMonitor } from "../monitoring/secret-monitor";
import type { SecretProviderKind, EncryptionAlgorithm } from "../contracts/enums";
import {
  AwsSecretsManagerBackend,
  AzureKeyVaultBackend,
  GcpSecretManagerBackend,
  HashicorpVaultBackend,
  KubernetesSecretsBackend,
} from "../providers/placeholder-backends";
import { asIdentitySecretProvider } from "../identity/secret-manager-identity-adapter";
import type { ISecretProvider } from "../../../intelligence/providers/identity/interfaces/secret-provider";

export interface SecretManagementPlatform {
  readonly manager: ISecretManager;
  readonly engine: SecretManagerEngine;
  /** Additive Identity plug-in. */
  readonly asIdentitySecretProvider: ISecretProvider;
  readonly providerKind: SecretProviderKind;
}

export interface CreateSecretManagementOptions {
  readonly providerKind?: SecretProviderKind;
  readonly masterKey?: string;
  readonly encryptionAlgorithm?: EncryptionAlgorithm;
  readonly backend?: ISecretBackend;
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

function createBackend(kind: SecretProviderKind): ISecretBackend {
  switch (kind) {
    case "local":
      return new LocalSecretBackend();
    case "environment":
      return new EnvironmentSecretBackend();
    case "aws_secrets_manager":
      return new AwsSecretsManagerBackend();
    case "azure_key_vault":
      return new AzureKeyVaultBackend();
    case "google_secret_manager":
      return new GcpSecretManagerBackend();
    case "hashicorp_vault":
      return new HashicorpVaultBackend();
    case "kubernetes_secrets":
      return new KubernetesSecretsBackend();
    default:
      return new LocalSecretBackend();
  }
}

export function createSecretManagementPlatform(
  options: CreateSecretManagementOptions = {}
): SecretManagementPlatform {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());
  const clockMs = options.clockMs ?? (() => Date.now());
  let seq = 0;
  const createId =
    options.createId ?? ((p) => `${p}_${++seq}_${clockMs()}`);

  const providerKind = options.providerKind ?? "local";
  const backend = options.backend ?? createBackend(providerKind);
  const encryptor = new LocalAes256Encryptor(
    options.masterKey ?? "unagency-local-dev-master-key",
    options.encryptionAlgorithm ?? "aes-256-gcm"
  );
  const cache = new InMemorySecretCache(clockMs);
  const auditor = new InMemorySecretAuditor(createId, nowIso);
  const monitor = new DefaultSecretMonitor(nowIso);

  const engine = new SecretManagerEngine({
    backend,
    encryptor,
    cache,
    auditor,
    monitor,
    nowIso,
    clockMs,
    createId,
  });

  return {
    manager: engine,
    engine,
    asIdentitySecretProvider: asIdentitySecretProvider(engine, providerKind),
    providerKind,
  };
}
