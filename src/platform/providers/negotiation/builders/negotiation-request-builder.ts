/**
 * NegotiationRequest builder.
 *
 * Purpose: Ergonomically construct immutable NegotiationRequest objects.
 * Responsibilities: Apply defaults; produce a frozen request.
 * Usage: Callers build a request from an ExecutionPlan + tenant scope.
 * Future Extension: Derive tenant scope from a planning context.
 */

import type {
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../../../core/identifiers";
import type { ExecutionPlan } from "../contracts/planning/execution-plan";
import type { NegotiableFeature } from "../contracts/enums";
import type {
  ExecutionPreference,
  NegotiationRequest,
  QualityRequirement,
} from "../contracts/negotiation-request";

export class NegotiationRequestBuilder {
  private _requestId?: string;
  private _plan?: ExecutionPlan;
  private _organizationId?: OrganizationId;
  private _workspaceId?: WorkspaceId;
  private _projectId?: string;
  private _userId?: UserId;
  private _region?: string;
  private _requestedFeatures?: NegotiableFeature[];
  private _preferences?: ExecutionPreference[];
  private _quality?: QualityRequirement;
  private _costCeiling?: number;
  private _attributes?: Record<string, unknown>;

  withRequestId(requestId: string): this {
    this._requestId = requestId;
    return this;
  }

  withPlan(plan: ExecutionPlan): this {
    this._plan = plan;
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

  withRegion(region: string): this {
    this._region = region;
    return this;
  }

  withRequestedFeatures(features: readonly NegotiableFeature[]): this {
    this._requestedFeatures = [...features];
    return this;
  }

  withPreferences(preferences: readonly ExecutionPreference[]): this {
    this._preferences = [...preferences];
    return this;
  }

  withQuality(quality: QualityRequirement): this {
    this._quality = quality;
    return this;
  }

  withCostCeiling(costCeiling: number): this {
    this._costCeiling = costCeiling;
    return this;
  }

  withAttributes(attributes: Readonly<Record<string, unknown>>): this {
    this._attributes = { ...attributes };
    return this;
  }

  build(): NegotiationRequest {
    if (!this._plan) {
      throw new Error("NegotiationRequest requires a plan");
    }
    if (!this._organizationId) {
      throw new Error("NegotiationRequest requires an organizationId");
    }
    if (!this._workspaceId) {
      throw new Error("NegotiationRequest requires a workspaceId");
    }
    return Object.freeze({
      requestId: this._requestId,
      plan: this._plan,
      organizationId: this._organizationId,
      workspaceId: this._workspaceId,
      projectId: this._projectId,
      userId: this._userId,
      region: this._region,
      requestedFeatures: this._requestedFeatures
        ? Object.freeze([...this._requestedFeatures])
        : undefined,
      preferences: this._preferences
        ? Object.freeze([...this._preferences])
        : undefined,
      quality: this._quality,
      costCeiling: this._costCeiling,
      attributes: this._attributes
        ? Object.freeze({ ...this._attributes })
        : undefined,
    });
  }
}
