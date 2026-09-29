/**
 * Optional production blob binding for RenderedFile bytes (M5B).
 * Metadata remains in the M5 RenderedFile store; bytes may live in IBlobStorage.
 */

import type { IBlobStorage } from "../../../persistence/interfaces";
import { renderError } from "./errors";

const g = globalThis as typeof globalThis & {
  __cdfRenderedBlobBackend?: IBlobStorage | null;
};

export function setCdfRenderedBlobStorage(storage: IBlobStorage | null): void {
  g.__cdfRenderedBlobBackend = storage;
}

export function getCdfRenderedBlobStorage(): IBlobStorage | null {
  return g.__cdfRenderedBlobBackend ?? null;
}

export async function putRenderedBlobToBackend(input: {
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<{ checksum?: string }> {
  const backend = getCdfRenderedBlobStorage();
  if (!backend) return {};
  const result = await backend.put(input.storageKey, input.bytes, input.mimeType);
  if (!result.ok) {
    throw renderError("STORAGE_FAILED", "IBlobStorage.put failed for rendered file", {
      storageKey: input.storageKey,
    });
  }
  return { checksum: result.value.checksum };
}

export async function getRenderedBlobFromBackend(
  storageKey: string,
): Promise<{ bytes: Uint8Array; mimeType?: string } | undefined> {
  const backend = getCdfRenderedBlobStorage();
  if (!backend) return undefined;
  const result = await backend.get(storageKey);
  if (!result.ok) {
    throw renderError("STORAGE_FAILED", "IBlobStorage.get failed", { storageKey });
  }
  if (!result.value) return undefined;
  const bytes = Buffer.from(result.value.data, "base64");
  return { bytes: new Uint8Array(bytes), mimeType: result.value.contentType };
}
