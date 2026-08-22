/**
 * Embedding provider readiness — inventory vs verified vs configured vs executable.
 */

import {
  ALL_EMBEDDING_PROVIDER_SPECS,
  VERIFIED_EMBEDDING_PROVIDER_SPECS,
  type VerifiedEmbeddingProviderSpec,
} from "../../intelligence/providers/embedding/configs/verified-embedding-provider-specs";
import { SEED_MODELS } from "../../intelligence/model-registry/discovery/inventory-seed";
import { isProviderEnableFlagOn } from "./provider-enable-flag";

export interface EmbeddingProviderEnvStatus {
  readonly providerId: string;
  readonly displayName: string;
  readonly inventoryBacked: boolean;
  readonly verified: boolean;
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly executable: boolean;
  readonly credentialEnvVar: string;
  readonly enableEnvVar: string;
  readonly blockedReason?: string;
}

export function evaluateEmbeddingProviderEnv(
  env: NodeJS.ProcessEnv = process.env
): EmbeddingProviderEnvStatus[] {
  return ALL_EMBEDDING_PROVIDER_SPECS.map((spec) => {
    const configured = Boolean(env[spec.credentialEnvVar]?.trim());
    const enabled = isProviderEnableFlagOn(env, spec.enableEnvVar, configured);
    const verified = spec.vendorApiVerified;
    return {
      providerId: spec.canonicalProviderId,
      displayName: spec.displayName,
      inventoryBacked: SEED_MODELS.some(
        (m) =>
          m.providerVendor === spec.vendor &&
          m.capabilities.includes("embedding.generate")
      ),
      verified,
      configured,
      enabled,
      executable: verified && enabled && configured,
      credentialEnvVar: spec.credentialEnvVar,
      enableEnvVar: spec.enableEnvVar,
      blockedReason: spec.blockedReason,
    };
  });
}

export function evaluateEmbeddingReadiness(env: NodeJS.ProcessEnv = process.env): {
  embeddingProvidersInventory: number;
  embeddingProvidersVerified: number;
  embeddingProvidersConfigured: number;
  embeddingProvidersExecutable: number;
  providers: EmbeddingProviderEnvStatus[];
} {
  const inventoryModels = SEED_MODELS.filter((m) =>
    m.capabilities.includes("embedding.generate")
  ).length;
  const providers = evaluateEmbeddingProviderEnv(env);
  return {
    embeddingProvidersInventory: inventoryModels,
    embeddingProvidersVerified: VERIFIED_EMBEDDING_PROVIDER_SPECS.length,
    embeddingProvidersConfigured: providers.filter((p) => p.configured).length,
    embeddingProvidersExecutable: providers.filter((p) => p.executable).length,
    providers,
  };
}

export function listVerifiedEmbeddingSpecs(): readonly VerifiedEmbeddingProviderSpec[] {
  return VERIFIED_EMBEDDING_PROVIDER_SPECS;
}
