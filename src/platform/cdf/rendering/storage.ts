/**
 * RenderedFile metadata + byte storage (M5).
 *
 * Bytes stay in a blob-like store — never inside CdfArtifactVersionRecord.data.
 * Production may swap InMemory for IBlobStorage / MediaIngestion; M5 defines the boundary.
 */

import type { CdfRenderedFile } from "./types";
import { renderError } from "./errors";

type BlobEntry = {
  bytes: Uint8Array;
  checksum: string;
  mimeType: string;
};

const g = globalThis as typeof globalThis & {
  __cdfRenderedFileStore?: Map<string, CdfRenderedFile>;
  __cdfRenderedBlobStore?: Map<string, BlobEntry>;
  __cdfRenderKeyIndex?: Map<string, string>;
};

function files(): Map<string, CdfRenderedFile> {
  if (!g.__cdfRenderedFileStore) g.__cdfRenderedFileStore = new Map();
  return g.__cdfRenderedFileStore;
}

function blobs(): Map<string, BlobEntry> {
  if (!g.__cdfRenderedBlobStore) g.__cdfRenderedBlobStore = new Map();
  return g.__cdfRenderedBlobStore;
}

function keyIndex(): Map<string, string> {
  if (!g.__cdfRenderKeyIndex) g.__cdfRenderKeyIndex = new Map();
  return g.__cdfRenderKeyIndex;
}

export function resetCdfRenderedFileStoreForTests(): void {
  g.__cdfRenderedFileStore = new Map();
  g.__cdfRenderedBlobStore = new Map();
  g.__cdfRenderKeyIndex = new Map();
}

export function putRenderedBlob(input: {
  storageKey: string;
  bytes: Uint8Array;
  checksum: string;
  mimeType: string;
}): void {
  const existing = blobs().get(input.storageKey);
  if (existing && existing.checksum !== input.checksum) {
    throw renderError(
      "STORAGE_FAILED",
      `Blob immutability conflict for ${input.storageKey}`,
      { storageKey: input.storageKey },
    );
  }
  blobs().set(input.storageKey, {
    bytes: new Uint8Array(input.bytes),
    checksum: input.checksum,
    mimeType: input.mimeType,
  });
}

/** Prefer in-memory cache; fall back to production IBlobStorage when bound. */
export async function getRenderedBlobAsync(
  storageKey: string,
): Promise<BlobEntry | undefined> {
  const local = getRenderedBlob(storageKey);
  if (local) return local;
  const { getRenderedBlobFromBackend } = await import("./blob-backend");
  const remote = await getRenderedBlobFromBackend(storageKey);
  if (!remote) return undefined;
  return {
    bytes: remote.bytes,
    checksum: "",
    mimeType: remote.mimeType ?? "application/octet-stream",
  };
}

export function getRenderedBlob(
  storageKey: string,
): BlobEntry | undefined {
  const b = blobs().get(storageKey);
  if (!b) return undefined;
  return {
    bytes: new Uint8Array(b.bytes),
    checksum: b.checksum,
    mimeType: b.mimeType,
  };
}

export function saveRenderedFile(record: CdfRenderedFile): CdfRenderedFile {
  const existingId = keyIndex().get(record.renderKey);
  if (existingId && existingId !== record.fileId) {
    throw renderError(
      "RENDER_IDEMPOTENCY_CONFLICT",
      `Render key ${record.renderKey} already bound to ${existingId}`,
      { renderKey: record.renderKey, existingId, fileId: record.fileId },
    );
  }
  const clone = structuredClone(record);
  files().set(clone.fileId, clone);
  keyIndex().set(clone.renderKey, clone.fileId);
  return structuredClone(clone);
}

export function getRenderedFile(fileId: string): CdfRenderedFile | undefined {
  const f = files().get(fileId);
  return f ? structuredClone(f) : undefined;
}

export function getRenderedFileByRenderKey(
  renderKey: string,
): CdfRenderedFile | undefined {
  const id = keyIndex().get(renderKey);
  if (!id) return undefined;
  return getRenderedFile(id);
}

export function listRenderedFilesForArtifact(
  artifactId: string,
  artifactVersion?: number,
): CdfRenderedFile[] {
  return [...files().values()]
    .filter(
      (f) =>
        f.artifactId === artifactId &&
        (artifactVersion == null || f.artifactVersion === artifactVersion),
    )
    .map((f) => structuredClone(f));
}
