/**
 * Artifact indexing ports — interfaces only (M3.2).
 */

import type { IArtifactIndex } from "../interfaces/artifact-ports";

export const METADATA_INDEX: IArtifactIndex = {
  kind: "metadata",
  supported: false,
};

export const RELATIONSHIP_INDEX: IArtifactIndex = {
  kind: "relationship",
  supported: false,
};

export const LINEAGE_INDEX: IArtifactIndex = {
  kind: "lineage",
  supported: false,
};

export const TEMPORAL_INDEX: IArtifactIndex = {
  kind: "temporal",
  supported: false,
};

export const SEMANTIC_INDEX: IArtifactIndex = {
  kind: "semantic",
  supported: false,
};

export const ARTIFACT_INDEX_PORTS: readonly IArtifactIndex[] = [
  METADATA_INDEX,
  RELATIONSHIP_INDEX,
  LINEAGE_INDEX,
  TEMPORAL_INDEX,
  SEMANTIC_INDEX,
];
