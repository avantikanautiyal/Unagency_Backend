/**
 * M9E — Collect Vault preview asset ids from Social Media canonical data.
 * Never treats art_* / exec_* / cdfart_* / URLs as Vault ids.
 */

import {
  isCdfCanonicalArtifactId,
  isExecutionIdShape,
  isMediaArtifactIdShape,
  isVaultAssetObjectIdShape,
} from "../../artifacts/ids";
import { renderError } from "../errors";

function assertVaultId(id: string): void {
  if (
    isMediaArtifactIdShape(id) ||
    isExecutionIdShape(id) ||
    isCdfCanonicalArtifactId(id) ||
    /^https?:\/\//i.test(id)
  ) {
    throw renderError(
      "ASSET_NOT_FOUND",
      `Social Media preview asset must be a Vault ObjectId — rejected identity: ${id}`,
      { vaultAssetId: id },
    );
  }
  if (!isVaultAssetObjectIdShape(id)) {
    throw renderError(
      "ASSET_NOT_FOUND",
      `Invalid vault asset id shape (expected 24-hex ObjectId): ${id}`,
      { vaultAssetId: id },
    );
  }
}

function readPreviewId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const id = (obj as { vaultAssetId?: unknown }).vaultAssetId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Resolve previewAssetRef for social-media.output.
 * Does not invent previews or layout.
 */
export function selectSocialMediaPreviewVaultId(
  data: Record<string, unknown>,
): string {
  const root = readPreviewId(data.previewAssetRef);
  if (!root) {
    throw renderError(
      "ARTIFACT_NOT_RENDERABLE",
      "Social Media output has no previewAssetRef — cannot invent raster or layout representation",
    );
  }
  assertVaultId(root);
  return root;
}

export function collectSocialMediaPreviewVaultIds(
  data: Record<string, unknown>,
): string[] {
  try {
    return [selectSocialMediaPreviewVaultId(data)];
  } catch {
    const root = readPreviewId(data.previewAssetRef);
    if (root && isVaultAssetObjectIdShape(root)) return [root];
    return [];
  }
}
