/**
 * Application-scoped default VaultAssetResolver for CDF render/materialize.
 *
 * Wired at platform boot (MediaFile + blob storage). Renderers never hard-code
 * Mongo/Vault lookups — they consume this dependency or an explicit deps override.
 */

import type { VaultAssetResolver } from "./asset-resolver";

const g = globalThis as typeof globalThis & {
  __cdfDefaultVaultAssetResolver?: VaultAssetResolver | null;
};

export function setDefaultVaultAssetResolver(
  resolver: VaultAssetResolver | null,
): void {
  g.__cdfDefaultVaultAssetResolver = resolver;
}

export function getDefaultVaultAssetResolver(): VaultAssetResolver | undefined {
  return g.__cdfDefaultVaultAssetResolver ?? undefined;
}

export function resetDefaultVaultAssetResolverForTests(): void {
  g.__cdfDefaultVaultAssetResolver = null;
}
