/**
 * Resolve a tenant input image to a provider-fetchable URL (signed blob or data URL).
 */

import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";
import type { BlobAccessService } from "../../media/blob/blob-access-service";
import type { InputAssetReference } from "./input-asset-validator";

export async function resolveProviderInputImageUrl(input: {
  readonly asset: InputAssetReference;
  readonly organizationId: string;
  readonly blobAccess?: BlobAccessService;
}): Promise<Result<string>> {
  const orgId = input.organizationId.trim();
  if (!orgId) {
    return failure(new ValidationError("organizationId required for input image resolution"));
  }

  if (input.asset.storageRef && input.blobAccess) {
    const signed = await input.blobAccess.createProviderInputSignedUrl(
      input.asset.storageRef,
      orgId
    );
    if (signed.ok) return success(signed.value.signedUrl);
    // Product assets may expose a data-URL fallback when blob metadata is missing.
    if (input.asset.url?.trim()) return success(input.asset.url.trim());
    return signed;
  }

  if (input.asset.url?.trim()) return success(input.asset.url.trim());

  return failure(
    new ValidationError("Input image asset missing storageRef and url")
  );
}
