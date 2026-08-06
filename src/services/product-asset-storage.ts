/**
 * Product asset blob storage composition (M10.4).
 *
 * PRODUCTION: requires ENTERPRISE_BLOB_BUCKET or AWS_S3_BUCKET — no silent memory fallback.
 * TESTS: PRODUCT_ASSET_STORAGE=memory (explicit only).
 */

import { blobStorageConfigFromEnv } from "../platform/persistence/storage/blob-storage-config";
import { S3BlobStorage } from "../platform/persistence/storage/s3-blob-storage";
import { InMemoryBlobStorage } from "../platform/persistence/storage/in-memory-blob-storage";
import type { IBlobStorage } from "../platform/persistence/interfaces/persistence";
import type { Result } from "../platform/intelligence/shared/result";
import { failure, success } from "../platform/intelligence/shared/result";
import { ValidationError } from "../platform/intelligence/shared/errors";

export type ProductAssetStorageMode = "s3" | "memory" | "unavailable";

export type ProductAssetBlobStorage = IBlobStorage & {
  readonly mode: ProductAssetStorageMode;
  createSignedGetUrl?(
    key: string,
    ttlSeconds: number,
    options?: {
      disposition?: "inline" | "attachment";
      filename?: string;
      cacheControl?: string;
    }
  ): Promise<Result<string>>;
};

let singleton: ProductAssetBlobStorage | undefined;

class MemoryProductBlobStorage
  extends InMemoryBlobStorage
  implements ProductAssetBlobStorage
{
  readonly mode = "memory" as const;

  async createSignedGetUrl(
    key: string,
    _ttlSeconds: number
  ): Promise<Result<string>> {
    const got = await this.get(key);
    if (!got.ok) return got;
    if (!got.value) {
      return failure(new ValidationError("blob not found"));
    }
    // Test-only data URL — not used in production.
    const mime = got.value.contentType ?? "application/octet-stream";
    return success(`data:${mime};base64,${got.value.data}`);
  }
}

class UnavailableProductBlobStorage implements ProductAssetBlobStorage {
  readonly mode = "unavailable" as const;

  async put(): Promise<Result<{ key: string; size: number }>> {
    return failure(
      new ValidationError(
        "Product asset storage is not configured. Set ENTERPRISE_BLOB_BUCKET or AWS_S3_BUCKET."
      )
    );
  }

  async get(): Promise<
    Result<{ key: string; data: string; contentType?: string } | undefined>
  > {
    return failure(
      new ValidationError("Product asset storage is not configured")
    );
  }

  async delete(): Promise<Result<void>> {
    return failure(
      new ValidationError("Product asset storage is not configured")
    );
  }
}

export function resolveProductAssetBlobStorage(
  env: NodeJS.ProcessEnv = process.env
): ProductAssetBlobStorage {
  if (env.PRODUCT_ASSET_STORAGE === "memory") {
    return new MemoryProductBlobStorage();
  }
  const config = blobStorageConfigFromEnv(env);
  if (config) {
    const s3 = new S3BlobStorage(config);
    return Object.assign(s3, { mode: "s3" as const }) as ProductAssetBlobStorage;
  }
  return new UnavailableProductBlobStorage();
}

export function getProductAssetBlobStorage(): ProductAssetBlobStorage {
  if (!singleton) {
    singleton = resolveProductAssetBlobStorage();
  }
  return singleton;
}

/** Test seam — reset singleton between suites */
export function setProductAssetBlobStorageForTests(
  storage: ProductAssetBlobStorage | undefined
): void {
  singleton = storage;
}
