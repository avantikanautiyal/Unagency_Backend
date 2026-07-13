/**
 * Placeholder artifact signature engine.
 * Supports checksums today; cryptographic signatures in future.
 */

import { createHash, randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type { Artifact, ArtifactSignature } from "../contracts/artifact-models";
import type { IArtifactSignatureEngine } from "../interfaces/artifact-ports";

export function canonicalizeForSigning(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export class PlaceholderArtifactSignatureEngine implements IArtifactSignatureEngine {
  sign(artifact: Omit<Artifact, "signature">): Result<ArtifactSignature> {
    const payload = canonicalizeForSigning({
      identity: artifact.identity,
      type: artifact.type,
      version: artifact.version,
      metadata: artifact.metadata,
      lineage: artifact.lineage,
      provenance: artifact.provenance,
      lifecycle: artifact.lifecycle,
      relationships: artifact.relationships,
      payload: artifact.payload,
    });
    const checksum = createHash("sha256").update(payload).digest("hex");
    const signedAt = new Date().toISOString();

    return success({
      algorithm: "canonical_sha256",
      checksum,
      signature: `placeholder_sig_${createHash("sha256")
        .update(`${checksum}:${signedAt}`)
        .digest("hex")
        .slice(0, 16)}`,
      signedAt,
      tamperDetected: false,
    });
  }

  verify(artifact: Artifact): Result<boolean> {
    const { signature: _ignored, ...unsigned } = artifact;
    const expected = this.sign(unsigned);
    if (!expected.ok) return expected;
    return success(expected.value.checksum === artifact.signature.checksum);
  }
}

export function detectTampering(artifact: Artifact, expectedChecksum: string): boolean {
  return artifact.signature.checksum !== expectedChecksum;
}

export function createManifestChecksum(artifactId: string, checksum: string): string {
  return createHash("sha256").update(`${artifactId}:${checksum}:${randomUUID()}`).digest("hex");
}
