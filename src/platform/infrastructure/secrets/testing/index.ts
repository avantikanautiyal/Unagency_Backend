/**
 * Secret Management testing helpers.
 */

import {
  createSecretManagementPlatform,
  type CreateSecretManagementOptions,
  type SecretManagementPlatform,
} from "../factories/create-secret-management-platform";
import { StoreSecretInputBuilder } from "../builders/store-secret-input-builder";

export function deterministicHelpers() {
  let id = 0;
  let ms = 1_700_000_000_000;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => new Date(ms).toISOString(),
    clockMs: () => {
      ms += 5;
      return ms;
    },
    advanceMs: (n: number) => {
      ms += n;
    },
  };
}

export function setupSecretManagement(
  options: CreateSecretManagementOptions = {}
): SecretManagementPlatform {
  const helpers = deterministicHelpers();
  return createSecretManagementPlatform({
    providerKind: "local",
    masterKey: "test-master-key-16+",
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export function sampleStoreInput(overrides: Partial<{ name: string; value: string }> = {}) {
  return StoreSecretInputBuilder.create()
    .withName(overrides.name ?? "openai-api-key")
    .withType("ai_provider_key")
    .withValue(overrides.value ?? "sk-test-secret-value-12345")
    .withActor("test")
    .withReason("unit_test")
    .build();
}
