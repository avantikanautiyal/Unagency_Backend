/**
 * Capability Intelligence request builder.
 */

import type { CapabilityIntelligenceRequest, CapabilityDiscoveryHints } from "../contracts/request";

export class CapabilityIntelligenceRequestBuilder {
  private requestId = "cap_req";
  private businessObjective = "";
  private discovery?: CapabilityDiscoveryHints;
  private preferredCapabilityIds?: string[];
  private metadata?: Record<string, unknown>;

  static create(): CapabilityIntelligenceRequestBuilder {
    return new CapabilityIntelligenceRequestBuilder();
  }

  withRequestId(id: string): this {
    this.requestId = id;
    return this;
  }

  withBusinessObjective(objective: string): this {
    this.businessObjective = objective;
    return this;
  }

  withDiscovery(discovery: CapabilityDiscoveryHints): this {
    this.discovery = { ...discovery };
    return this;
  }

  withPreferredCapabilities(ids: readonly string[]): this {
    this.preferredCapabilityIds = [...ids];
    return this;
  }

  withMetadata(metadata: Readonly<Record<string, unknown>>): this {
    this.metadata = { ...metadata };
    return this;
  }

  build(): CapabilityIntelligenceRequest {
    return {
      requestId: this.requestId,
      businessObjective: this.businessObjective,
      discovery: this.discovery,
      preferredCapabilityIds: this.preferredCapabilityIds,
      metadata: this.metadata,
    };
  }
}
