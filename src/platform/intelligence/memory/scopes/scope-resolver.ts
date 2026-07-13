/**
 * Memory scope resolution — interfaces-backed placeholder.
 */

import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  MemoryIngestInput,
  MemoryRequest,
  MemoryScope,
  MemoryWriteInput,
} from "../contracts/memory-models";
import type { IMemoryScopeResolver } from "../interfaces/memory-ports";

export class MemoryScopeResolver implements IMemoryScopeResolver {
  resolve(
    input: MemoryWriteInput | MemoryIngestInput | MemoryRequest
  ): Result<MemoryScope> {
    if ("scope" in input && input.scope) {
      return success(input.scope);
    }

    const identity = input.identity;
    if (identity.sessionId) {
      return success({
        kind: "session",
        scopeId: identity.sessionId,
        parentScopeId: identity.workspaceId,
      });
    }
    if (identity.conversationId) {
      return success({
        kind: "conversation",
        scopeId: identity.conversationId,
        parentScopeId: identity.workspaceId,
      });
    }
    if (identity.taskId) {
      return success({
        kind: "task",
        scopeId: identity.taskId,
        parentScopeId: identity.projectId ?? identity.workspaceId,
      });
    }
    if (identity.campaignId) {
      return success({
        kind: "campaign",
        scopeId: identity.campaignId,
        parentScopeId: identity.workspaceId,
      });
    }
    if (identity.projectId) {
      return success({
        kind: "project",
        scopeId: identity.projectId,
        parentScopeId: identity.workspaceId,
      });
    }

    return success({
      kind: "workspace",
      scopeId: String(identity.workspaceId),
      parentScopeId: String(identity.organizationId),
    });
  }
}
