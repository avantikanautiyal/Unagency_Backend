/**
 * Artifact snapshot and manifest builders.
 */

import { createHash, randomUUID } from "crypto";
import type {
  Artifact,
  ArtifactManifest,
  ArtifactSnapshot,
} from "../contracts/artifact-models";
import type {
  IArtifactManifestBuilder,
  IArtifactSnapshotBuilder,
} from "../interfaces/artifact-ports";

export class ArtifactManifestBuilder implements IArtifactManifestBuilder {
  build(artifact: Artifact): ArtifactManifest {
    const payload = JSON.stringify({
      artifactId: artifact.identity.artifactId,
      type: artifact.type,
      version: artifact.version.label,
      checksum: artifact.signature.checksum,
    });
    return {
      manifestId: `aman_${randomUUID()}`,
      artifactId: artifact.identity.artifactId,
      type: artifact.type,
      version: artifact.version,
      identity: artifact.identity,
      checksum: createHash("sha256").update(payload).digest("hex"),
      createdAt: new Date().toISOString(),
    };
  }
}

export class ArtifactSnapshotBuilder implements IArtifactSnapshotBuilder {
  constructor(private readonly manifestBuilder: IArtifactManifestBuilder) {}

  build(artifact: Artifact, manifest?: ArtifactManifest): ArtifactSnapshot {
    const resolvedManifest = manifest ?? this.manifestBuilder.build(artifact);
    const capturedAt = new Date().toISOString();
    const checksum = createHash("sha256")
      .update(
        JSON.stringify({
          snapshotId: resolvedManifest.manifestId,
          artifactChecksum: artifact.signature.checksum,
          capturedAt,
        })
      )
      .digest("hex");

    return {
      snapshotId: `asnap_${randomUUID()}`,
      artifact,
      manifest: resolvedManifest,
      capturedAt,
      checksum,
    };
  }
}
