/**
 * Artifact identity and metadata builders.
 */

import { randomUUID } from "crypto";
import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ArtifactIdentity,
  ArtifactInput,
  ArtifactMetadata,
} from "../contracts/artifact-models";
import { ArtifactValidationError } from "../errors";
import type {
  IArtifactIdentityBuilder,
  IArtifactMetadataBuilder,
} from "../interfaces/artifact-ports";

export class ArtifactIdentityBuilder implements IArtifactIdentityBuilder {
  build(input: ArtifactInput): Result<ArtifactIdentity> {
    if (!input.identity.organizationId || !input.identity.workspaceId) {
      return failure(
        new ArtifactValidationError("organizationId and workspaceId are required")
      );
    }

    return success({
      artifactId: input.identity.artifactId ?? `art_${input.type}_${randomUUID()}`,
      type: input.type,
      organizationId: input.identity.organizationId,
      workspaceId: input.identity.workspaceId,
      userId: input.identity.userId,
      capabilityId: input.identity.capabilityId,
      executionId: input.identity.executionId,
      projectId: input.identity.projectId,
      campaignId: input.identity.campaignId,
      taskId: input.identity.taskId,
      conversationId: input.identity.conversationId,
      sessionId: input.identity.sessionId,
      correlationId: input.identity.correlationId,
    });
  }
}

export class ArtifactMetadataBuilder implements IArtifactMetadataBuilder {
  build(input: ArtifactInput, identity: ArtifactIdentity): Result<ArtifactMetadata> {
    const now = new Date().toISOString();
    return success({
      title: input.metadata?.title ?? `${input.type} artifact`,
      description: input.metadata?.description,
      tags: input.metadata?.tags ?? [input.type],
      sourceModule: input.metadata?.sourceModule ?? input.sourceModule,
      contentType: input.metadata?.contentType ?? `application/vnd.unagency.${input.type}+json`,
      createdAt: input.metadata?.createdAt ?? now,
      updatedAt: input.metadata?.updatedAt ?? now,
      attributes: input.metadata?.attributes,
    });
  }
}
