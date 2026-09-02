/**
 * Provider metadata model.
 *
 * Purpose: Strongly typed description of an AI provider (metadata only).
 * Responsibilities: Hold registration attributes without execution logic.
 * Usage: Stored in ProviderRegistry; never invokes SDKs.
 * Future Extension: Regional pricing tiers, SLA metadata.
 */

import type { CapabilityId, ProviderId } from "../../core/identifiers";

export type ProviderStatus =
  | "draft"
  | "active"
  | "degraded"
  | "maintenance"
  | "deprecated"
  | "disabled"
  | "offline";

export type ProviderModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "structured"
  | "embedding"
  | "multimodal";

export type ProviderAuthenticationType =
  | "api_key"
  | "oauth"
  | "service_account"
  | "jwt"
  | "bearer_token";

export type ProviderPricingModel =
  | "token"
  | "request"
  | "subscription"
  | "hybrid"
  | "unknown";

export interface ProviderConcurrencyLimits {
  readonly maxConcurrentRequests?: number;
  readonly maxConcurrentPerTenant?: number;
}

export interface ProviderTimeoutLimits {
  readonly defaultTimeoutMs: number;
  readonly maxTimeoutMs?: number;
}

export interface ProviderRateLimits {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
  readonly requestsPerDay?: number;
}

/**
 * Complete provider definition — registry metadata entry.
 */
export interface ProviderDefinition {
  readonly id: ProviderId;
  readonly vendor: string;
  readonly displayName: string;
  readonly version: string;
  readonly status: ProviderStatus;
  readonly supportedModalities: readonly ProviderModality[];
  readonly supportedCapabilities: readonly CapabilityId[];
  readonly supportedRegions: readonly string[];
  readonly authenticationType: ProviderAuthenticationType;
  readonly pricingModel: ProviderPricingModel;
  readonly concurrencyLimits: ProviderConcurrencyLimits;
  readonly timeoutLimits: ProviderTimeoutLimits;
  readonly rateLimits: ProviderRateLimits;
  readonly streamingSupport: boolean;
  readonly functionCallingSupport: boolean;
  readonly visionSupport: boolean;
  readonly embeddingsSupport: boolean;
  readonly imageSupport: boolean;
  readonly audioSupport: boolean;
  readonly videoSupport: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}
