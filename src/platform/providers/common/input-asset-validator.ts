/**
 * Input asset tenant isolation for image edit / vision requests.
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { BlobAccessService } from "../../../media/blob/blob-access-service";

export interface InputAssetReference {
  readonly storageRef?: string;
  readonly url?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly mimeType?: string;
}

export function extractInputAssets(
  input: Readonly<Record<string, unknown>>
): readonly InputAssetReference[] {
  const assets: InputAssetReference[] = [];
  const rawAssets = input.assets;
  if (Array.isArray(rawAssets)) {
    for (const a of rawAssets) {
      if (a && typeof a === "object") {
        const rec = a as Record<string, unknown>;
        assets.push({
          storageRef: typeof rec.storageRef === "string" ? rec.storageRef : undefined,
          url: typeof rec.url === "string" ? rec.url : undefined,
          organizationId: typeof rec.organizationId === "string" ? rec.organizationId : undefined,
          workspaceId: typeof rec.workspaceId === "string" ? rec.workspaceId : undefined,
          mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
        });
      }
    }
  }

  const image = input.image;
  if (image && typeof image === "object") {
    const rec = image as Record<string, unknown>;
    assets.push({
      storageRef: typeof rec.storageRef === "string" ? rec.storageRef : undefined,
      url: typeof rec.url === "string" ? rec.url : undefined,
      organizationId: typeof rec.organizationId === "string" ? rec.organizationId : undefined,
      workspaceId: typeof rec.workspaceId === "string" ? rec.workspaceId : undefined,
      mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
    });
  }

  const audio = input.audio;
  if (audio && typeof audio === "object") {
    const rec = audio as Record<string, unknown>;
    assets.push({
      storageRef: typeof rec.storageRef === "string" ? rec.storageRef : undefined,
      url: typeof rec.url === "string" ? rec.url : undefined,
      organizationId: typeof rec.organizationId === "string" ? rec.organizationId : undefined,
      workspaceId: typeof rec.workspaceId === "string" ? rec.workspaceId : undefined,
      mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
    });
  }

  return assets;
}

export function validateInputAssetTenancy(input: {
  readonly assets: readonly InputAssetReference[];
  readonly organizationId: string;
  readonly workspaceId?: string;
}): Result<void> {
  for (const asset of input.assets) {
    if (asset.organizationId && asset.organizationId !== input.organizationId) {
      return failure(
        new ValidationError(
          "Input asset organizationId does not match execution context — cross-tenant reference rejected"
        )
      );
    }
    if (
      asset.storageRef &&
      asset.storageRef.includes("/") &&
      !asset.storageRef.startsWith(`org/${input.organizationId}/`) &&
      !asset.storageRef.startsWith(`${input.organizationId}/`)
    ) {
      const parts = asset.storageRef.split("/");
      const maybeOrg = parts.find((p) => p.startsWith("org_"));
      if (maybeOrg && maybeOrg !== input.organizationId) {
        return failure(
          new ValidationError(
            "Input asset storageRef appears to belong to another tenant — rejected"
          )
        );
      }
    }
  }
  return success(undefined);
}

/** M9.5D — server-authoritative blob ownership via BlobAccessService. */
export function validateInputAssetsWithBlobAccess(input: {
  readonly assets: readonly InputAssetReference[];
  readonly organizationId: string;
  readonly blobAccess: BlobAccessService;
}): Result<void> {
  for (const asset of input.assets) {
    if (!asset.storageRef) continue;
    const resolved = input.blobAccess.resolveForTenant(
      asset.storageRef,
      input.organizationId
    );
    if (!resolved.ok) return resolved;
  }
  return success(undefined);
}
