/**
 * Tenant ownership guards for execution context providers.
 */

import { failure, success, type Result } from "../../../intelligence/shared/result";
import { AuthorizationError } from "../../../intelligence/shared/errors";

export function assertTenantOwnership(input: {
  organizationId: string;
  entityOrganizationId: string | undefined;
  entityKind: string;
  entityId: string;
}): Result<void> {
  if (!input.entityOrganizationId) {
    return failure(
      new AuthorizationError(`${input.entityKind} ${input.entityId} has no tenant`)
    );
  }
  if (input.entityOrganizationId !== input.organizationId) {
    return failure(
      new AuthorizationError(
        `tenant isolation violation: ${input.entityKind} ${input.entityId} not in organization ${input.organizationId}`
      )
    );
  }
  return success(undefined);
}
