/**
 * Vault asset checks for REPLACE_ASSET refinement ops (M6).
 */

import { isVaultAssetObjectIdShape } from "../artifacts/ids";
import { refinementError } from "./errors";

const g = globalThis as typeof globalThis & {
  __cdfRefinementKnownVaultAssets?: Set<string>;
};

export function setCdfRefinementKnownVaultAssets(
  ids: Iterable<string> | undefined,
): void {
  g.__cdfRefinementKnownVaultAssets = ids
    ? new Set([...ids])
    : undefined;
}

export function resetCdfRefinementVaultForTests(): void {
  g.__cdfRefinementKnownVaultAssets = undefined;
}

/**
 * Validate REPLACE_ASSET vault id shape + optional known-asset registry.
 * Rejects exec_* / cdfart_* / art_* / URL identity leaks.
 */
export function assertVaultAssetForRefinement(input: {
  vaultAssetId: string;
}): void {
  const id = input.vaultAssetId;
  if (
    id.startsWith("exec_") ||
    id.startsWith("cdfart_") ||
    id.startsWith("art_")
  ) {
    throw refinementError(
      "ASSET_NOT_FOUND",
      "Vault asset ids must not be execution, media art_*, or artifact ids",
      { vaultAssetId: id },
    );
  }
  if (/^https?:\/\//i.test(id)) {
    throw refinementError(
      "ASSET_NOT_FOUND",
      "Vault asset ids must not be arbitrary URLs",
      { vaultAssetId: id },
    );
  }
  if (!isVaultAssetObjectIdShape(id)) {
    throw refinementError(
      "ASSET_NOT_FOUND",
      `Invalid vault asset id (expected 24-hex ObjectId): ${id}`,
      { vaultAssetId: id },
    );
  }
  const known = g.__cdfRefinementKnownVaultAssets;
  if (known && !known.has(id)) {
    throw refinementError(
      "ASSET_NOT_FOUND",
      `Vault asset not found: ${id}`,
      { vaultAssetId: id },
    );
  }
}
