/**
 * Artifact validator — identity, version, metadata, lineage, lifecycle, signatures.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  Artifact,
  ArtifactValidationIssue,
  ArtifactValidationResult,
} from "../contracts/artifact-models";
import { canTransitionArtifactLifecycle } from "../lifecycle/artifact-lifecycle";
import type { IArtifactValidator } from "../interfaces/artifact-ports";
import type { IArtifactSignatureEngine } from "../interfaces/artifact-ports";

export class ArtifactValidator implements IArtifactValidator {
  constructor(private readonly signatureEngine: IArtifactSignatureEngine) {}

  validate(artifact: Artifact): Result<ArtifactValidationResult> {
    const issues: ArtifactValidationIssue[] = [];
    const validatedAt = new Date().toISOString();

    if (!artifact.identity.artifactId) {
      issues.push({
        code: "IDENTITY_MISSING",
        message: "artifactId is required",
        path: "identity.artifactId",
        severity: "error",
      });
    }

    if (artifact.identity.type !== artifact.type) {
      issues.push({
        code: "TYPE_MISMATCH",
        message: "identity.type must match artifact.type",
        path: "identity.type",
        severity: "error",
      });
    }

    if (artifact.version.major < 0 || artifact.version.minor < 0) {
      issues.push({
        code: "INVALID_VERSION",
        message: "version components must be non-negative",
        path: "version",
        severity: "error",
      });
    }

    if (!artifact.metadata.createdAt || !artifact.metadata.updatedAt) {
      issues.push({
        code: "METADATA_TIMESTAMPS",
        message: "metadata timestamps are required",
        path: "metadata",
        severity: "error",
      });
    }

    if (!artifact.lineage.organizationId || !artifact.lineage.workspaceId) {
      issues.push({
        code: "LINEAGE_SCOPE",
        message: "lineage organizationId and workspaceId are required",
        path: "lineage",
        severity: "error",
      });
    }

    if (!artifact.provenance.createdByModule) {
      issues.push({
        code: "PROVENANCE_MODULE",
        message: "provenance.createdByModule is required",
        path: "provenance",
        severity: "error",
      });
    }

    if (artifact.lifecycle === "deleted" && artifact.version.state === "published") {
      issues.push({
        code: "LIFECYCLE_CONFLICT",
        message: "published artifacts should not be deleted directly",
        path: "lifecycle",
        severity: "warning",
      });
    }

    if (!canTransitionArtifactLifecycle("created", artifact.lifecycle) && artifact.lifecycle !== "created") {
      // lifecycle state itself is valid enum member — check signature
    }

    const signatureValid = this.signatureEngine.verify(artifact);
    if (
      artifact.signature.checksum &&
      artifact.signature.checksum !== "pending" &&
      signatureValid.ok &&
      !signatureValid.value
    ) {
      issues.push({
        code: "SIGNATURE_INVALID",
        message: "artifact signature verification failed",
        path: "signature",
        severity: "error",
      });
    }

    for (const rel of artifact.relationships) {
      if (!rel.sourceArtifactId || !rel.targetArtifactId) {
        issues.push({
          code: "RELATIONSHIP_INVALID",
          message: "relationship endpoints are required",
          path: "relationships",
          severity: "error",
        });
      }
    }

    const valid = issues.every((i) => i.severity !== "error");
    return success({ valid, issues, validatedAt });
  }
}
