/**
 * Vault asset resolution boundary for renderers (M5).
 *
 * DeckSpec holds vaultAssetId references — never binaries.
 * Renderer resolves via this abstraction; missing required assets fail clearly.
 */

import { isVaultAssetObjectIdShape } from "../artifacts/ids";
import { renderError } from "./errors";

export type VaultAssetResolver = {
  /**
   * Resolve vault asset bytes for the given tenant.
   * Returns undefined if not found (caller decides fail vs optional).
   */
  resolve(input: {
    vaultAssetId: string;
    organizationId?: string;
    workspaceId?: string;
    projectId?: string;
  }): Promise<Uint8Array | undefined>;
};

/** Collect vaultAssetId strings from Presentation DeckSpec-shaped data. */
export function collectVaultAssetIdsFromDeckData(
  data: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  const slides = data.slides;
  if (!Array.isArray(slides)) return [];
  for (const slide of slides) {
    if (!slide || typeof slide !== "object") continue;
    const elements = (slide as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;
    for (const el of elements) {
      if (!el || typeof el !== "object") continue;
      const id = (el as { vaultAssetId?: unknown }).vaultAssetId;
      if (typeof id === "string" && id.length > 0) ids.add(id);
    }
  }
  return [...ids].sort();
}

export async function resolveAssetsForRender(input: {
  vaultAssetIds: string[];
  resolver?: VaultAssetResolver;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  /** When true, missing assets throw ASSET_NOT_FOUND. */
  requireAll?: boolean;
}): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  if (input.vaultAssetIds.length === 0) return out;

  const resolver = input.resolver;
  if (!resolver) {
    if (input.requireAll !== false && input.vaultAssetIds.length > 0) {
      throw renderError(
        "ASSET_NOT_FOUND",
        `Vault assets required but no VaultAssetResolver provided: ${input.vaultAssetIds.join(",")}`,
        { vaultAssetIds: input.vaultAssetIds },
      );
    }
    return out;
  }

  for (const vaultAssetId of input.vaultAssetIds) {
    if (!isVaultAssetObjectIdShape(vaultAssetId)) {
      throw renderError(
        "ASSET_NOT_FOUND",
        `Invalid vault asset id shape (expected 24-hex ObjectId): ${vaultAssetId}`,
        { vaultAssetId },
      );
    }
    const bytes = await resolver.resolve({
      vaultAssetId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });
    if (!bytes) {
      if (input.requireAll !== false) {
        throw renderError(
          "ASSET_NOT_FOUND",
          `Required vault asset not found: ${vaultAssetId}`,
          { vaultAssetId },
        );
      }
      continue;
    }
    out.set(vaultAssetId, bytes);
  }
  return out;
}

/** In-memory resolver for tests / fixtures. */
export function createMemoryVaultAssetResolver(
  assets: Record<string, Uint8Array | string>,
): VaultAssetResolver {
  const map = new Map<string, Uint8Array>();
  for (const [id, value] of Object.entries(assets)) {
    map.set(
      id,
      typeof value === "string" ? new TextEncoder().encode(value) : value,
    );
  }
  return {
    async resolve({ vaultAssetId }) {
      const b = map.get(vaultAssetId);
      return b ? new Uint8Array(b) : undefined;
    },
  };
}
