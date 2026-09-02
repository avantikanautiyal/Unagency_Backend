/**
 * Identity negotiator.
 *
 * Purpose: Consult the Provider Identity Platform (interface only) to validate
 *   that a credential session, authorization, trust, and scope are obtainable.
 * Responsibilities: Create + immediately release a validation session; never
 *   execute, never expose secrets.
 * Usage: Identity stage of the negotiation pipeline.
 * Future Extension: Dry-run validation without session acquisition.
 */

import { isFailure, success, type Result } from "../../../core/result";
import type { ProviderPermission } from "../../identity/contracts/enums";
import type { CreateCredentialSessionRequest } from "../../identity/contracts/requests";
import type { IProviderIdentityEngine } from "../../identity/interfaces/identity-engine";
import type { IdentityEvaluation } from "../contracts/evaluations";
import type { NegotiationContext } from "../interfaces/context";
import type { IIdentityNegotiator } from "../interfaces/negotiators";

const VALIDATION_PERMISSIONS: readonly ProviderPermission[] = ["read", "execute"];

export class IdentityNegotiator implements IIdentityNegotiator {
  constructor(private readonly identityEngine?: IProviderIdentityEngine) {}

  async negotiate(
    context: NegotiationContext
  ): Promise<Result<IdentityEvaluation>> {
    const providerId = context.providerId;

    if (!this.identityEngine) {
      return success({
        attempted: false,
        validated: false,
        providerId,
        grantedPermissions: [],
        reasons: ["identity platform not configured; validation skipped"],
      });
    }

    const request: CreateCredentialSessionRequest = {
      providerId,
      organizationId: context.request.organizationId,
      workspaceId: context.request.workspaceId,
      projectId: context.request.projectId,
      userId: context.request.userId,
      capabilityId: context.request.plan.capabilityId,
      requiredPermissions: VALIDATION_PERMISSIONS,
      region: context.request.region,
      actor: "negotiation",
    };

    const sessionResult = await this.identityEngine.createCredentialSession(
      request
    );

    if (isFailure(sessionResult)) {
      return success({
        attempted: true,
        validated: false,
        providerId,
        grantedPermissions: [],
        reasons: [sessionResult.error.message],
      });
    }

    const session = sessionResult.value;
    // We only validated authorization — we are NOT executing, so release now.
    this.identityEngine.releaseSession(session.sessionId);

    return success({
      attempted: true,
      validated: session.authorization.authorized,
      providerId,
      trustLevel: session.trustLevel,
      grantedPermissions: session.grantedPermissions,
      sessionId: session.sessionId,
      reasons: [],
    });
  }
}
