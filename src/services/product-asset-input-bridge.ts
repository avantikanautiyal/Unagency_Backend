/**
 * ProductAsset → provider input-asset bridge.
 * Resolves owned product assets into provider payload refs (audio/vision).
 * No vendor SDKs — bytes come from IBlobStorage only.
 */

import { ApiError } from "../utils/apiError";
import { productAssetService } from "./product-asset-service";
import type { InputAssetReference } from "../platform/providers/common/input-asset-validator";

export type ResolvedProductAssetPayload = {
  readonly assets: readonly InputAssetReference[];
  readonly audio?: InputAssetReference;
};

/**
 * Load owned product assets and map to provider input refs.
 * Prefers data-URL payload so sync STT dispatchers can read bytes without a second hop.
 */
export async function resolveProductAssetIdsForProvider(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly assetIds: readonly string[];
}): Promise<ResolvedProductAssetPayload> {
  const assets: InputAssetReference[] = [];
  for (const assetId of input.assetIds) {
    if (!assetId?.trim()) continue;
    const resolved = await productAssetService.resolveProviderInputAsset({
      userId: input.userId,
      assetId: assetId.trim(),
      organizationId: input.organizationId,
    });
    assets.push(resolved);
  }
  if (assets.length === 0) {
    throw new ApiError("No resolvable product assets for provider input", 400);
  }
  const audio =
    assets.find((a) => (a.mimeType ?? "").startsWith("audio/")) ?? assets[0];
  return { assets, audio };
}

/**
 * Attach resolved `assets` / `audio` / `image` onto execution metadata
 * so providers see bytes (or URLs), not only opaque ProductAsset id strings.
 */
export async function attachProductAssetsToExecutionMetadata(input: {
  readonly userId: string;
  readonly organizationId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<Record<string, unknown>> {
  const meta: Record<string, unknown> = { ...(input.metadata ?? {}) };
  const rawIds = meta.assetIds;
  const assetIds = Array.isArray(rawIds)
    ? rawIds.map(String).filter(Boolean)
    : typeof rawIds === "string" && rawIds.trim()
      ? [rawIds.trim()]
      : [];

  if (assetIds.length === 0) {
    return meta;
  }

  const resolved = await resolveProductAssetIdsForProvider({
    userId: input.userId,
    organizationId: input.organizationId,
    assetIds,
  });

  const existingAssets = Array.isArray(meta.assets) ? [...meta.assets] : [];
  meta.assets = [...existingAssets, ...resolved.assets];
  if (!meta.audio && resolved.audio) {
    meta.audio = resolved.audio;
  }
  const firstImage = resolved.assets.find((a) =>
    (a.mimeType ?? "").toLowerCase().startsWith("image/")
  );
  if (firstImage && !meta.image) {
    meta.image = firstImage;
  }
  meta.productAssetIds = assetIds;
  return meta;
}