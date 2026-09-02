/**
 * Authorization service (RBAC).
 */

import { failure, success, type Result } from "../../core/result";
import { AuthorizationError } from "../../core/errors";
import type { AuthPrincipal, Permission } from "../contracts";
import type { IAuthorizationService } from "../interfaces";
import { hasPermission, permissionsForRoles } from "../authorization/rbac";

export class RbacAuthorizationService implements IAuthorizationService {
  permissionsFor(principal: AuthPrincipal): readonly Permission[] {
    return permissionsForRoles(principal.roles);
  }

  authorize(
    principal: AuthPrincipal,
    permissions: readonly Permission[]
  ): Result<void> {
    if (!permissions.length) return success(undefined);
    const granted = this.permissionsFor(principal);
    if (!hasPermission(granted, permissions)) {
      return failure(
        new AuthorizationError("insufficient permissions", {
          required: permissions,
          granted,
        })
      );
    }
    return success(undefined);
  }
}
