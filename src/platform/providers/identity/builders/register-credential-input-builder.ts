/**
 * Register-credential input builder.
 *
 * Purpose: Ergonomically construct immutable RegisterCredentialInput objects.
 * Responsibilities: apply defaults; produce a frozen input.
 * Usage: Callers register credentials via the store.
 * Future Extension: Derive scope from a tenancy context object.
 */

import type {
  CapabilityId,
  OrganizationId,
  ProviderId,
  UserId,
  WorkspaceId,
} from "../../../core/identifiers";
import type {
  CredentialPolicy,
  CredentialRotationPolicy,
} from "../contracts/credential";
import type {
  AuthenticationScheme,
  ProviderPermission,
  ProviderTrustLevel,
  TenancyLevel,
} from "../contracts/enums";
import type {
  ProviderRegionConstraint,
  ProviderScope,
} from "../contracts/provider-scope";
import type { RegisterCredentialInput } from "../contracts/requests";

export class RegisterCredentialInputBuilder {
  private _providerId?: ProviderId;
  private _scheme: AuthenticationScheme = "api_key";
  private _secret?: string;
  private _tenancy: TenancyLevel = "organization";
  private _scope: {
    organizationId?: OrganizationId;
    workspaceId?: WorkspaceId;
    projectId?: string;
    userId?: UserId;
    providerId?: ProviderId;
    capabilityIds?: CapabilityId[];
  } = {};
  private _trustLevel?: ProviderTrustLevel;
  private _permissions?: ProviderPermission[];
  private _expiresAt?: string;
  private _rotationPolicy?: CredentialRotationPolicy;
  private _regionConstraint?: ProviderRegionConstraint;
  private _policy?: CredentialPolicy;
  private _labels?: Record<string, unknown>;

  withProvider(providerId: ProviderId): this {
    this._providerId = providerId;
    this._scope.providerId = providerId;
    return this;
  }

  withScheme(scheme: AuthenticationScheme): this {
    this._scheme = scheme;
    return this;
  }

  withSecret(secret: string): this {
    this._secret = secret;
    return this;
  }

  withTenancy(tenancy: TenancyLevel): this {
    this._tenancy = tenancy;
    return this;
  }

  withOrganization(organizationId: OrganizationId): this {
    this._scope.organizationId = organizationId;
    return this;
  }

  withWorkspace(workspaceId: WorkspaceId): this {
    this._scope.workspaceId = workspaceId;
    return this;
  }

  withProject(projectId: string): this {
    this._scope.projectId = projectId;
    return this;
  }

  withUser(userId: UserId): this {
    this._scope.userId = userId;
    return this;
  }

  withCapabilities(capabilityIds: readonly CapabilityId[]): this {
    this._scope.capabilityIds = [...capabilityIds];
    return this;
  }

  withTrustLevel(trustLevel: ProviderTrustLevel): this {
    this._trustLevel = trustLevel;
    return this;
  }

  withPermissions(permissions: readonly ProviderPermission[]): this {
    this._permissions = [...permissions];
    return this;
  }

  withExpiry(expiresAt: string): this {
    this._expiresAt = expiresAt;
    return this;
  }

  withRotationPolicy(policy: CredentialRotationPolicy): this {
    this._rotationPolicy = policy;
    return this;
  }

  withRegionConstraint(constraint: ProviderRegionConstraint): this {
    this._regionConstraint = constraint;
    return this;
  }

  withPolicy(policy: CredentialPolicy): this {
    this._policy = policy;
    return this;
  }

  withLabels(labels: Readonly<Record<string, unknown>>): this {
    this._labels = { ...labels };
    return this;
  }

  build(): RegisterCredentialInput {
    if (!this._providerId) {
      throw new Error("RegisterCredentialInput requires a providerId");
    }
    if (this._secret === undefined) {
      throw new Error("RegisterCredentialInput requires a secret");
    }
    const scope: ProviderScope = Object.freeze({
      organizationId: this._scope.organizationId,
      workspaceId: this._scope.workspaceId,
      projectId: this._scope.projectId,
      userId: this._scope.userId,
      providerId: this._scope.providerId ?? this._providerId,
      capabilityIds: this._scope.capabilityIds
        ? Object.freeze([...this._scope.capabilityIds])
        : undefined,
    });

    return Object.freeze({
      providerId: this._providerId,
      scheme: this._scheme,
      secret: this._secret,
      tenancy: this._tenancy,
      scope,
      trustLevel: this._trustLevel,
      permissions: this._permissions
        ? Object.freeze([...this._permissions])
        : undefined,
      expiresAt: this._expiresAt,
      rotationPolicy: this._rotationPolicy,
      regionConstraint: this._regionConstraint,
      policy: this._policy,
      labels: this._labels ? Object.freeze({ ...this._labels }) : undefined,
    });
  }
}
