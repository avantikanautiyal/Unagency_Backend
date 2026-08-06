/**
 * M10.18 — Optional multipart / resumable upload surface on blob storage.
 * Implemented by S3BlobStorage; memory adapter simulates for tests.
 */

import type { Result } from "../../intelligence/shared/result";

export type MultipartInitResult = {
  uploadId: string;
  key: string;
};

export type MultipartPartResult = {
  partNumber: number;
  etag: string;
};

export interface IMultipartBlobStorage {
  createMultipartUpload(
    key: string,
    contentType?: string
  ): Promise<Result<MultipartInitResult>>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Uint8Array
  ): Promise<Result<MultipartPartResult>>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: readonly { partNumber: number; etag: string }[]
  ): Promise<Result<{ key: string; size: number; checksum?: string }>>;
  abortMultipartUpload(key: string, uploadId: string): Promise<Result<void>>;
  /** Presigned URL for client-direct part upload (S3 only). */
  createSignedUploadPartUrl?(
    key: string,
    uploadId: string,
    partNumber: number,
    ttlSeconds: number
  ): Promise<Result<string>>;
}

export function supportsMultipart(
  storage: unknown
): storage is IMultipartBlobStorage {
  return (
    !!storage &&
    typeof (storage as IMultipartBlobStorage).createMultipartUpload === "function" &&
    typeof (storage as IMultipartBlobStorage).uploadPart === "function" &&
    typeof (storage as IMultipartBlobStorage).completeMultipartUpload === "function"
  );
}
