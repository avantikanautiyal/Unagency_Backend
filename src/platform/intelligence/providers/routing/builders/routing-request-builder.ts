/**
 * Routing request builder.
 */

import type { CapabilityId } from "../../../shared/identifiers";
import type { RoutingCandidate } from "../contracts/candidate";
import type { RoutingConstraint, RoutingPolicy } from "../contracts/policy";
import type { RoutingStrategyKind } from "../contracts/enums";
import type { RoutingPreferences, RoutingRequest } from "../contracts/request";

export class RoutingRequestBuilder {
  private requestId = "";
  private capabilityId?: CapabilityId;
  private candidates: RoutingCandidate[] = [];
  private strategy: RoutingStrategyKind = "balanced";
  private policy?: RoutingPolicy;
  private constraints: RoutingConstraint[] = [];
  private preferences?: RoutingPreferences;
  private metadata: Record<string, unknown> = {};
  private createdAt = new Date().toISOString();

  static create(): RoutingRequestBuilder {
    return new RoutingRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }
  withCapabilityId(id: CapabilityId): this {
    this.capabilityId = id;
    return this;
  }
  withCandidates(candidates: readonly RoutingCandidate[]): this {
    this.candidates = [...candidates];
    return this;
  }
  withStrategy(strategy: RoutingStrategyKind): this {
    this.strategy = strategy;
    return this;
  }
  withPolicy(policy: RoutingPolicy): this {
    this.policy = policy;
    return this;
  }
  withConstraints(constraints: readonly RoutingConstraint[]): this {
    this.constraints = [...constraints];
    return this;
  }
  withPreferences(preferences: RoutingPreferences): this {
    this.preferences = preferences;
    return this;
  }
  withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }
  withCreatedAt(createdAt: string): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): RoutingRequest {
    if (!this.requestId) throw new Error("RoutingRequest requires requestId");
    if (!this.capabilityId) throw new Error("RoutingRequest requires capabilityId");
    if (!this.candidates.length) throw new Error("RoutingRequest requires candidates");
    return Object.freeze({
      requestId: this.requestId,
      capabilityId: this.capabilityId,
      candidates: Object.freeze([...this.candidates]),
      strategy: this.strategy,
      policy: this.policy,
      constraints: Object.freeze([...this.constraints]),
      preferences: this.preferences,
      metadata: Object.freeze({ ...this.metadata }),
      createdAt: this.createdAt,
    });
  }
}
