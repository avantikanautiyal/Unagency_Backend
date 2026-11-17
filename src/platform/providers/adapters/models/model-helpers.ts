/**
 * Model helpers.
 *
 * Purpose: Query/resolve provider models within a manifest.
 * Responsibilities: model lookup, feature checks, default resolution.
 * Usage: Used by manifest projection, validators, translators.
 * Future Extension: Per-model rate limit resolution.
 */

import type { ProviderManifest } from "../contracts/provider-manifest";
import type {
  ProviderModel,
} from "../contracts/provider-model";

export function findModel(
  manifest: ProviderManifest,
  modelId: string
): ProviderModel | undefined {
  return manifest.models.find(
    (model) => model.id === modelId || model.aliases.includes(modelId)
  );
}

export function defaultModel(
  manifest: ProviderManifest
): ProviderModel | undefined {
  return (
    manifest.models.find((model) => model.isDefault) ?? manifest.models[0]
  );
}

