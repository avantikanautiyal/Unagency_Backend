/**
 * Artifact lineage engine — parent/child/derived relationships.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  ArtifactIdentity,
  ArtifactInput,
  ArtifactLineage,
} from "../contracts/artifact-models";
import type { IArtifactLineageEngine } from "../interfaces/artifact-ports";

export class ArtifactLineageEngine implements IArtifactLineageEngine {
  build(input: ArtifactInput, identity: ArtifactIdentity): Result<ArtifactLineage> {
    const lineage: ArtifactLineage = {
      parents: input.parents ?? input.lineage?.parents ?? [],
      children: input.lineage?.children ?? [],
      createdFrom: input.createdFrom ?? input.lineage?.createdFrom ?? [],
      derivedFrom: input.derivedFrom ?? input.lineage?.derivedFrom ?? [],
      executionId: input.lineage?.executionId ?? identity.executionId,
      organizationId: identity.organizationId,
      workspaceId: identity.workspaceId,
      campaignId: input.lineage?.campaignId ?? identity.campaignId,
      projectId: input.lineage?.projectId ?? identity.projectId,
      taskId: input.lineage?.taskId ?? identity.taskId,
      conversationId: input.lineage?.conversationId ?? identity.conversationId,
      sessionId: input.lineage?.sessionId ?? identity.sessionId,
    };
    return success(lineage);
  }
}
