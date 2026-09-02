/**
 * M9.5O1 — Binary audio stream + optional blob putStream tee.
 * No base64 SSE for large audio.
 */

import type { IBlobStorage } from "../../../persistence/interfaces/persistence";

export type AudioStreamClass =
  | "NATIVE_INCREMENTAL_AUDIO"
  | "HTTP_BINARY_STREAM"
  | "BUFFERED_AUDIO"
  | "REALTIME_SESSION";

export interface BinaryAudioChunk {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/**
 * Tee provider binary chunks to client consumer and optional putStream.
 * Incomplete upload must not finalize as authoritative artifact.
 */
export async function teeBinaryAudioStream(input: {
  readonly chunks: AsyncIterable<BinaryAudioChunk>;
  readonly onClientChunk: (chunk: BinaryAudioChunk) => void | Promise<void>;
  readonly blobStorage?: IBlobStorage;
  readonly storageKey?: string;
  readonly signal?: AbortSignal;
  readonly maxBytes?: number;
}): Promise<{
  readonly finalized: boolean;
  readonly totalBytes: number;
  readonly mimeType?: string;
  readonly aborted: boolean;
}> {
  let total = 0;
  let mimeType: string | undefined;
  let aborted = false;
  const collected: Uint8Array[] = [];

  try {
    for await (const chunk of input.chunks) {
      if (input.signal?.aborted) {
        aborted = true;
        break;
      }
      mimeType = chunk.mimeType || mimeType;
      total += chunk.bytes.byteLength;
      if (input.maxBytes != null && total > input.maxBytes) {
        aborted = true;
        break;
      }
      await input.onClientChunk(chunk);
      if (input.blobStorage?.putStream && input.storageKey) {
        collected.push(chunk.bytes);
      }
    }
  } catch {
    aborted = true;
  }

  if (aborted || !input.blobStorage?.putStream || !input.storageKey) {
    return { finalized: false, totalBytes: total, mimeType, aborted };
  }

  async function* asStream(): AsyncIterable<Uint8Array> {
    for (const part of collected) yield part;
  }

  const put = await input.blobStorage.putStream(input.storageKey, asStream(), {
    contentType: mimeType ?? "application/octet-stream",
  });
  if (!put.ok) {
    return { finalized: false, totalBytes: total, mimeType, aborted: true };
  }

  return { finalized: true, totalBytes: total, mimeType, aborted: false };
}

/** Fake binary audio source for offline certification. */
export async function* fakeBinaryAudioChunks(
  parts: readonly { size: number; mimeType?: string }[],
  signal?: AbortSignal
): AsyncIterable<BinaryAudioChunk> {
  for (const p of parts) {
    if (signal?.aborted) return;
    yield {
      bytes: new Uint8Array(p.size),
      mimeType: p.mimeType ?? "audio/mpeg",
    };
  }
}
