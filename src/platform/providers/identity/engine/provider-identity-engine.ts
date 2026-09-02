/**
 * Provider Identity & Trust engine (platform facade).
 *
 * Purpose: Resolve identities and mint validated, secret-free credential sessions.
 * Responsibilities: orchestrate resolution → authentication → authorization →
 *   trust → validation → session; audit + emit events. NEVER exposes secrets.
 * Usage: The Provider Runtime requests a session via this engine.
 * Future Extension: Delegation, impersonation, attestation.
 *
 * SUCCESS CRITERION: the caller receives ONLY a validated CredentialSession and
 * never learns where the secret lives, how auth works, or which provider is used.
 */

import type { IClock } from "../../../core/interfaces";
import { failure, isFailure, success, type Result } from "../../../core/result";
import type { ProviderId } from "../../../core/identifiers";
import type { CredentialReference, ProviderCredential } from "../contracts/credential";
import type { CredentialId } from "../contracts/identifiers";
import type {
  ProviderIdentity,
  ProviderIdentitySnapshot,
} from "../contracts/provider-identity";
import type {
  CreateCredentialSessionRequest,
  ResolveIdentityRequest,
} from "../contracts/requests";
import type { CredentialAuditEvent } from "../contracts/rotation";
import type { CredentialSession } from "../contracts/session";
import {
  CredentialNotFoundError,
  ProviderAuthenticationError,
  ProviderAuthorizationError,
  ProviderTrustError,
  CredentialValidationError,
} from "../errors";
import type { IAuditCredentialLogger } from "../interfaces/audit-logger";
import type { IProviderAuthenticationEngine } from "../interfaces/authentication-engine";
import type { IProviderAuthorizationEngine } from "../interfaces/authorization-engine";
import type { ICredentialMasker } from "../interfaces/credential-masker";
import type { ICredentialStore } from "../interfaces/credential-store";
import type { ICredentialValidator } from "../interfaces/credential-validator";
import type { ICredentialEventPublisher } from "../interfaces/event-publisher";
import type { IProviderIdentityEngine } from "../interfaces/identity-engine";
import type { ICredentialSessionManager } from "../interfaces/session-manager";
import type { ISecretProvider } from "../interfaces/secret-provider";
import type { IProviderTrustEngine } from "../interfaces/trust-engine";
import { DEFAULT_EXECUTION_PERMISSIONS } from "../permissions/permission-set";

export interface ProviderIdentityEngineDeps {
  readonly store: ICredentialStore;
  readonly secretProvider: ISecretProvider;
  readonly authentication: IProviderAuthenticationEngine;
  readonly authorization: IProviderAuthorizationEngine;
  readonly trust: IProviderTrustEngine;
  readonly validator: ICredentialValidator;
  readonly sessions: ICredentialSessionManager;
  readonly masker: ICredentialMasker;
  readonly audit: IAuditCredentialLogger;
  readonly events: ICredentialEventPublisher;
  readonly clock: IClock;
}

export class ProviderIdentityEngine implements IProviderIdentityEngine {
  constructor(private readonly deps: ProviderIdentityEngineDeps) {}

  resolveIdentity(request: ResolveIdentityRequest): Result<ProviderIdentity> {
    const credentialResult = this.selectCredential(request);
    if (isFailure(credentialResult)) {
      return credentialResult;
    }
    const credential = credentialResult.value;
    return success({
      providerId: credential.reference.providerId,
      tenancy: credential.metadata.tenancy,
      binding: {
        providerId: credential.reference.providerId,
        tenancy: credential.metadata.tenancy,
        organizationId: request.organizationId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        userId: request.userId,
      },
      trustLevel: credential.metadata.trustLevel,
      scope: credential.metadata.scope,
      credentialRef: credential.reference,
    });
  }

  resolveCredentialReference(
    request: ResolveIdentityRequest
  ): Result<CredentialReference> {
    const credentialResult = this.selectCredential(request);
    if (isFailure(credentialResult)) {
      return credentialResult;
    }
    return success(credentialResult.value.reference);
  }

  async createCredentialSession(
    request: CreateCredentialSessionRequest
  ): Promise<Result<CredentialSession>> {
    const credentialResult = this.selectCredential(request);
    if (isFailure(credentialResult)) {
      return credentialResult;
    }
    const credential = credentialResult.value;
    const requiredPermissions =
      request.requiredPermissions ?? DEFAULT_EXECUTION_PERMISSIONS;

    // 1. Confirm the secret exists WITHOUT retrieving its value.
    const hasSecret = await this.deps.secretProvider.hasSecret(
      credential.reference.secretRef
    );
    if (isFailure(hasSecret)) {
      return hasSecret;
    }

    // 2. Authenticate (no networking).
    const authResult = this.deps.authentication.authenticate({
      credential,
      secretPresent: hasSecret.value,
    });
    if (isFailure(authResult)) {
      return authResult;
    }
    if (!authResult.value.authenticated) {
      return failure(
        new ProviderAuthenticationError("Authentication failed", {
          reasons: authResult.value.reasons,
        })
      );
    }

    // 3. Authorize.
    const authzResult = this.deps.authorization.authorize({
      credential,
      request,
      requiredPermissions,
    });
    if (isFailure(authzResult)) {
      return authzResult;
    }
    if (!authzResult.value.authorized) {
      return failure(
        new ProviderAuthorizationError("Authorization denied", {
          reasons: authzResult.value.reasons,
        })
      );
    }

    // 4. Trust evaluation.
    const trustResult = this.deps.trust.evaluate({ credential, request });
    if (isFailure(trustResult)) {
      return trustResult;
    }
    if (!trustResult.value.trusted) {
      return failure(
        new ProviderTrustError("Trust validation failed", {
          checks: trustResult.value.checks.filter((c) => !c.passed),
        })
      );
    }

    // 5. Validate credential across all dimensions.
    const validation = this.deps.validator.validate({
      credential,
      request,
      requiredPermissions,
      nowMs: this.deps.clock.now().getTime(),
    });
    if (!validation.valid) {
      return failure(
        new CredentialValidationError("Credential validation failed", {
          failed: validation.checks.filter((c) => !c.passed),
        })
      );
    }

    // 6. Acquire a secret-free session.
    const sessionResult = this.deps.sessions.acquire({
      credentialId: credential.reference.credentialId,
      providerId: credential.reference.providerId,
      scheme: credential.reference.scheme,
      scope: credential.metadata.scope,
      trustLevel: trustResult.value.trustLevel,
      grantedPermissions: authzResult.value.grantedPermissions,
      reference: credential.reference,
      authentication: authResult.value,
      authorization: authzResult.value,
      validation,
      ttlMs: request.ttlMs,
    });
    if (isFailure(sessionResult)) {
      return sessionResult;
    }

    await this.emit({
      type: "credential_validated",
      credentialId: credential.reference.credentialId,
      providerId: credential.reference.providerId,
      at: this.deps.clock.nowIso(),
      actor: request.actor,
    });
    await this.emit({
      type: "credential_used",
      credentialId: credential.reference.credentialId,
      providerId: credential.reference.providerId,
      at: this.deps.clock.nowIso(),
      actor: request.actor,
      metadata: { sessionId: sessionResult.value.sessionId },
    });

    return sessionResult;
  }

  releaseSession(sessionId: string): Result<void> {
    return this.deps.sessions.release(sessionId);
  }

  snapshot(credentialId: CredentialId): Result<ProviderIdentitySnapshot> {
    const resolved = this.deps.store.resolveCredential(credentialId);
    if (isFailure(resolved)) {
      return failure(
        new CredentialNotFoundError("Credential not found", { credentialId })
      );
    }
    const credential = resolved.value;
    const identity: ProviderIdentity = {
      providerId: credential.reference.providerId,
      tenancy: credential.metadata.tenancy,
      binding: {
        providerId: credential.reference.providerId,
        tenancy: credential.metadata.tenancy,
        organizationId: credential.metadata.scope.organizationId,
        workspaceId: credential.metadata.scope.workspaceId,
        projectId: credential.metadata.scope.projectId,
        userId: credential.metadata.scope.userId,
      },
      trustLevel: credential.metadata.trustLevel,
      scope: credential.metadata.scope,
      credentialRef: credential.reference,
    };
    return success({
      identity,
      credential: credential.metadata,
      // Never the real secret — a fixed, non-reversible indicator of presence.
      maskedSecret: this.deps.masker.maskFull("redacted-secret-value"),
      capturedAt: this.deps.clock.nowIso(),
    });
  }

  private selectCredential(request: {
    readonly providerId: ProviderId;
    readonly organizationId: ResolveIdentityRequest["organizationId"];
    readonly workspaceId: ResolveIdentityRequest["workspaceId"];
  }): Result<ProviderCredential> {
    const candidates = this.deps.store.listCredentials({
      providerId: request.providerId,
      organizationId: request.organizationId,
      workspaceId: request.workspaceId,
      status: "active",
    });
    const credential = candidates[0];
    if (!credential) {
      return failure(
        new CredentialNotFoundError(
          "No active credential for provider in tenant",
          {
            providerId: request.providerId,
            organizationId: request.organizationId,
            workspaceId: request.workspaceId,
          }
        )
      );
    }
    return success(credential);
  }

  private async emit(event: CredentialAuditEvent): Promise<void> {
    this.deps.audit.record(event);
    await this.deps.events.publish(event);
  }
}
