/**
 * Create-credential-session request builder.
 *
 * Purpose: Ergonomically construct immutable CreateCredentialSessionRequest.
 * Responsibilities: apply defaults; produce a frozen request.
 * Usage: The Provider Runtime builds a session request.
 * Future Extension: Derive from a ProviderExecutionContext.
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  UserId,
  WorkspaceId,
} from "../../../shared/identifiers";
import type { ProviderPermission } from "../contracts/enums";
import type { CreateCredentialSessionRequest } from "../contracts/requests";

export class CreateCredentialSessionRequestBuilder {
  private _providerId?: ProviderId;
  private _organizationId?: OrganizationId;
  private _workspaceId?: WorkspaceId;
  private _projectId?: string;
  private _userId?: UserId;
  private _capabilityId?: CapabilityId;
  private _requiredPermissions?: ProviderPermission[];
  private _region?: string;
  private _classification?: string;
  private _ttlMs?: number;
  private _actor?: string;

  withProvider(providerId: ProviderId): this {
    this._providerId = providerId;
    return this;
  }

  withOrganization(organizationId: OrganizationId): this {
    this._organizationId = organizationId;
    return this;
  }

  withWorkspace(workspaceId: WorkspaceId): this {
    this._workspaceId = workspaceId;
    return this;
  }

  withProject(projectId: string): this {
    this._projectId = projectId;
    return this;
  }

  withUser(userId: UserId): this {
    this._userId = userId;
    return this;
  }

  withCapability(capabilityId: CapabilityId): this {
    this._capabilityId = capabilityId;
    return this;
  }

  withRequiredPermissions(permissions: readonly ProviderPermission[]): this {
    this._requiredPermissions = [...permissions];
    return this;
  }

  withRegion(region: string): this {
    this._region = region;
    return this;
  }

  withClassification(classification: string): this {
    this._classification = classification;
    return this;
  }

  withTtl(ttlMs: number): this {
    this._ttlMs = ttlMs;
    return this;
  }

  withActor(actor: string): this {
    this._actor = actor;
    return this;
  }

  build(): CreateCredentialSessionRequest {
    if (!this._providerId) {
      throw new Error("CreateCredentialSessionRequest requires a providerId");
    }
    if (!this._organizationId) {
      throw new Error(
        "CreateCredentialSessionRequest requires an organizationId"
      );
    }
    if (!this._workspaceId) {
      throw new Error("CreateCredentialSessionRequest requires a workspaceId");
    }
    return Object.freeze({
      providerId: this._providerId,
      organizationId: this._organizationId,
      workspaceId: this._workspaceId,
      projectId: this._projectId,
      userId: this._userId,
      capabilityId: this._capabilityId,
      requiredPermissions: this._requiredPermissions
        ? Object.freeze([...this._requiredPermissions])
        : undefined,
      region: this._region,
      classification: this._classification,
      ttlMs: this._ttlMs,
      actor: this._actor,
    });
  }
}
