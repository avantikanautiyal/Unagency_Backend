/**
 * Artifact provenance engine — tracks intelligence origins.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ArtifactIdentity,
  ArtifactInput,
  ArtifactLineage,
  ArtifactProvenance,
  ArtifactProvenanceSource,
} from "../contracts/artifact-models";
import type { IArtifactProvenanceEngine } from "../interfaces/artifact-ports";

function defaultSourceForType(
  type: ArtifactProvenanceSource["kind"],
  timestamp: string
): ArtifactProvenanceSource {
  return { kind: type, timestamp };
}

export class ArtifactProvenanceEngine implements IArtifactProvenanceEngine {
  build(
    input: ArtifactInput,
    identity: ArtifactIdentity,
    lineage: ArtifactLineage
  ): Result<ArtifactProvenance> {
    const now = new Date().toISOString();
    const sources: ArtifactProvenanceSource[] = [...(input.provenance?.sources ?? [])];

    if (!sources.length) {
      sources.push(defaultSourceForType("execution", now));
      if (input.type === "context") sources.push(defaultSourceForType("context", now));
      if (input.type === "knowledge") sources.push(defaultSourceForType("knowledge", now));
      if (input.type === "prompt") sources.push(defaultSourceForType("prompt", now));
      if (input.type === "evaluation") sources.push(defaultSourceForType("evaluation", now));
    }

    for (const parent of lineage.parents) {
      sources.push({
        kind: mapArtifactTypeToProvenance(parent.type),
        artifactId: parent.artifactId,
        versionLabel: parent.versionLabel,
        timestamp: now,
      });
    }

    const provenance: ArtifactProvenance = {
      sources,
      createdByModule: input.sourceModule,
      createdAt: input.provenance?.createdAt ?? now,
      policyIds: input.provenance?.policyIds,
      capabilityId: input.provenance?.capabilityId ?? identity.capabilityId,
      providerId: input.provenance?.providerId,
      modelId: input.provenance?.modelId,
      versions: input.provenance?.versions,
    };

    return success(provenance);
  }
}

function mapArtifactTypeToProvenance(
  type: ArtifactInput["type"]
): ArtifactProvenanceSource["kind"] {
  switch (type) {
    case "context":
      return "context";
    case "knowledge":
      return "knowledge";
    case "prompt":
      return "prompt";
    case "provider_request":
    case "provider_response":
      return "provider";
    case "execution":
      return "execution";
    case "evaluation":
      return "evaluation";
    case "human":
      return "human";
    case "workflow":
      return "workflow";
    case "capability":
      return "capability";
    case "policy":
      return "policy";
    default:
      return "execution";
  }
}
