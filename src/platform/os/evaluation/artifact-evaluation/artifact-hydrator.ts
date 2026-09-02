/**
 * Hydrate benchmark/production artifacts into evaluable bytes.
 */

import type { IArtifactRepository } from "../../../infrastructure/durability/interfaces/execution-store-ports";
import type { IBlobStorage } from "../../../persistence/interfaces/persistence";
import { parseStorageRefKey } from "../../../media/blob/tenant-blob-key-builder";
import type { HydratedArtifact } from "./types";

function mimeToKind(mime: string): HydratedArtifact["kind"] {
  const m = mime.toLowerCase();
  if (m.includes("html")) return "html";
  if (m.includes("pdf")) return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.includes("presentation") || m.includes("pptx")) return "pptx";
  if (m.includes("word") || m.includes("docx")) return "docx";
  if (m.includes("zip")) return "zip";
  return "other";
}

export async function hydrateArtifacts(input: {
  readonly artifactsRepo: IArtifactRepository;
  readonly blobStorage: IBlobStorage;
  readonly organizationId: string;
  readonly artifactIds: readonly string[];
}): Promise<readonly HydratedArtifact[]> {
  const hydrated: HydratedArtifact[] = [];

  for (const artifactId of input.artifactIds) {
    const rec = await input.artifactsRepo.get(artifactId);
    if (!rec || rec.organizationId !== input.organizationId) continue;

    const storageRef = rec.artifact.label;
    if (!storageRef.startsWith("blob:")) continue;
    const key = parseStorageRefKey(storageRef);
    const blob = await input.blobStorage.get(key);
    if (!blob.ok || !blob.value) continue;

    const bytes = Buffer.from(blob.value.data, "base64");
    const mimeType = blob.value.contentType ?? "application/octet-stream";
    const kind = mimeToKind(mimeType);
    const textContent = kind === "html" ? bytes.toString("utf8") : undefined;

    hydrated.push(
      Object.freeze({
        artifactId,
        mimeType,
        byteSize: bytes.length,
        bytes,
        kind,
        textContent,
      }),
    );
  }

  return Object.freeze(hydrated);
}

export function createArtifactHydrator(input: {
  readonly artifactsRepo: IArtifactRepository;
  readonly blobStorage: IBlobStorage;
  readonly organizationId: string;
}): (artifactIds: readonly string[]) => Promise<readonly HydratedArtifact[]> {
  return (artifactIds) =>
    hydrateArtifacts({
      artifactsRepo: input.artifactsRepo,
      blobStorage: input.blobStorage,
      organizationId: input.organizationId,
      artifactIds,
    });
}
