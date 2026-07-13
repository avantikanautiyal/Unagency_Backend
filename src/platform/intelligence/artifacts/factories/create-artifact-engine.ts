/**
 * Factory for ArtifactEngine with default in-memory components.
 */

import { ArtifactIdentityBuilder, ArtifactMetadataBuilder } from "../metadata/artifact-metadata";
import { ArtifactEngine } from "../engine/artifact-engine";
import type { IArtifactEngine } from "../interfaces/artifact-ports";
import { ArtifactLineageEngine } from "../lineage/lineage-engine";
import { ArtifactProvenanceEngine } from "../provenance/provenance-engine";
import { InMemoryArtifactRegistry } from "../registry/artifact-registry";
import { PlaceholderArtifactSignatureEngine } from "../signatures/signature-engine";
import {
  ArtifactManifestBuilder,
  ArtifactSnapshotBuilder,
} from "../snapshots/snapshot-builder";
import { ArtifactValidator } from "../validation/artifact-validator";
import { ArtifactVersionEngine } from "../versioning/version-engine";

export function createArtifactEngine(): IArtifactEngine {
  const signatureEngine = new PlaceholderArtifactSignatureEngine();
  const manifestBuilder = new ArtifactManifestBuilder();
  return new ArtifactEngine({
    registry: new InMemoryArtifactRegistry(),
    identityBuilder: new ArtifactIdentityBuilder(),
    metadataBuilder: new ArtifactMetadataBuilder(),
    versionEngine: new ArtifactVersionEngine(),
    lineageEngine: new ArtifactLineageEngine(),
    provenanceEngine: new ArtifactProvenanceEngine(),
    signatureEngine,
    validator: new ArtifactValidator(signatureEngine),
    manifestBuilder,
    snapshotBuilder: new ArtifactSnapshotBuilder(manifestBuilder),
  });
}
