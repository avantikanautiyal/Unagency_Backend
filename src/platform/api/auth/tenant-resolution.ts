/**
 * Enterprise API tenant resolution — server-side tenant scope only for Firebase principals.
 */

import type { ApiRequest, AuthPrincipal, TenantContext } from "../contracts";
import { isFirebaseAuthenticatedPrincipal } from "./firebase/firebase-authentication-adapter";

export function resolveTenantContext(
  request: ApiRequest,
  principal: AuthPrincipal | undefined,
  params: Record<string, string>
): TenantContext | undefined {
  if (!principal) {
    return undefined;
  }

  const firebaseBound = isFirebaseAuthenticatedPrincipal(principal);

  // Firebase-authenticated users: tenant scope comes ONLY from server-resolved principal.
  const organizationId = firebaseBound
    ? principal.organizationId
    : principal.organizationId ??
      params.organizationId ??
      (request.body as { organizationId?: string } | undefined)?.organizationId ??
      (request.query?.organizationId as string | undefined);

  if (!organizationId) {
    return undefined;
  }

  if (
    firebaseBound &&
    principal.organizationId &&
    organizationId !== principal.organizationId
  ) {
    return undefined;
  }

  const workspaceId = firebaseBound
    ? principal.workspaceId
    : principal.workspaceId ??
      (request.body as { workspaceId?: string } | undefined)?.workspaceId ??
      request.query?.workspaceId;

  return {
    organizationId,
    workspaceId,
    userId: principal.userId,
    projectId: firebaseBound
      ? undefined
      : (request.body as { projectId?: string } | undefined)?.projectId,
  };
}
