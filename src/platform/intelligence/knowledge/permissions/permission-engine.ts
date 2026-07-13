/**
 * Knowledge permission engine — validates access before returning knowledge.
 */

import { failure, success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  KnowledgeDocument,
  KnowledgeRequest,
} from "../contracts/knowledge-models";
import { KnowledgePermissionError } from "../errors";
import type { IKnowledgePermissionEngine } from "../interfaces/knowledge-ports";

export class KnowledgePermissionEngine implements IKnowledgePermissionEngine {
  async authorize(request: KnowledgeRequest): Promise<Result<void>> {
    const permission = request.permission;
    if (!permission.organizationId || !permission.workspaceId) {
      return failure(
        new KnowledgePermissionError("Organization and workspace are required")
      );
    }

    if (
      String(permission.organizationId) !==
        String(request.identity.organizationId) ||
      String(permission.workspaceId) !== String(request.identity.workspaceId)
    ) {
      return failure(
        new KnowledgePermissionError("Permission identity mismatch")
      );
    }

    const required = request.filter?.requiredPermissions ?? [];
    for (const perm of required) {
      if (!permission.permissions.includes(perm)) {
        return failure(
          new KnowledgePermissionError("Missing required permission", {
            permission: perm,
          })
        );
      }
    }

    return success(undefined);
  }

  async filterAuthorized(
    request: KnowledgeRequest,
    documents: readonly KnowledgeDocument[]
  ): Promise<Result<readonly KnowledgeDocument[]>> {
    const classification = request.permission.classification;
    if (!classification) {
      return success(documents);
    }

    // Placeholder: allow internal/public always; restricted requires explicit permission
    const allowed = documents.filter((doc) => {
      const docClass = doc.metadata.classification ?? "internal";
      if (docClass === "restricted" || docClass === "pii") {
        return request.permission.permissions.includes("knowledge.restricted");
      }
      return true;
    });

    return success(allowed);
  }
}
