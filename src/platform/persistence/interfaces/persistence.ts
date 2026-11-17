/**
 * Persistence platform interfaces — sole contracts consumers depend on.
 */

import type { Result } from "../../core/result";

export interface BlobPutStreamOptions {
  readonly contentType?: string;
  readonly maxBytes?: number;
}

export interface IBlobStorage {
  put(
    key: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<Result<{ key: string; size: number; checksum?: string }>>;
  /** Stream upload — avoids loading large media into memory. Optional for backwards compatibility. */
  putStream?(
    key: string,
    stream: AsyncIterable<Uint8Array>,
    options?: BlobPutStreamOptions
  ): Promise<Result<{ key: string; size: number; checksum?: string }>>;
  get(key: string): Promise<Result<{ key: string; data: string; contentType?: string } | undefined>>;
  delete(key: string): Promise<Result<void>>;
}

