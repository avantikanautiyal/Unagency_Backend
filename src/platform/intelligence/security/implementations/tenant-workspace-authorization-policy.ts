import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  AuthorizationRequest,
  AuthorizationResult,
} from "../contracts/security-context";
import type { IAuthorizationPolicy } from "../interfaces/security";

/**
 * Minimal tenant-scoped authorization.
 *
 * This is not full RBAC yet (no principal/roles plumbing in invokeCapability yet),
 * but it removes the "always allow" behavior:
 *  - denies when organization/workspace context is missing
 *  - denies unexpected action/resource combinations
 *  - allows integration/system calls when tenant context is present
 */
export class TenantWorkspaceAuthorizationPolicy
  implements IAuthorizationPolicy
{
  async authorize(
    request: AuthorizationRequest
  ): Promise<Result<AuthorizationResult>> {
    const { context, action, resourceType } = request;

    // Only allow known intelligence gateway actions for now.
    if (action !== "capability.invoke" && action !== "capability.health") {
      return success({
        allowed: false,
        reason: `denied_unexpected_action:${action}`,
      });
    }

    if (resourceType !== "capability" && resourceType !== "intelligence") {
      return success({
        allowed: false,
        reason: `denied_unexpected_resourceType:${resourceType}`,
      });
    }

    const org = String(context.organizationId ?? "").trim();
    const ws = String(context.workspaceId ?? "").trim();
    if (!org || !ws) {
      return success({
        allowed: false,
        reason: "denied_missing_tenant_context",
      });
    }

    // Integration/system actors are allowed when tenant context is present.
    if (
      context.actorType === "integration" ||
      context.actorType === "system" ||
      context.actorType === "agent"
    ) {
      return success({ allowed: true, reason: "tenant_ok" });
    }

    // Otherwise deny until we have real principal/role plumbing.
    return success({
      allowed: false,
      reason: `denied_actorType:${context.actorType}`,
    });
  }
}

