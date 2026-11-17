/**
 * Rate limit, billing, webhook, file stubs for API surface.
 */

import type { RateLimitDimension } from "./enums";
import type { RateLimitAccountingClass } from "../../execution-reliability/execution-outcome";

export interface RateLimitPolicy {
  readonly dimension: RateLimitDimension;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: string;
  readonly dimension: RateLimitDimension;
  readonly key: string;
  readonly limit?: number;
  readonly windowMs?: number;
  readonly accountingClass?: RateLimitAccountingClass;
}

export interface CapabilityResource {
  readonly capabilityId: string;
  readonly name: string;
  readonly department?: string;
  readonly supportedProviders: readonly string[];
}

export interface ProviderCatalogResource {
  readonly providerId: string;
  readonly displayName: string;
  readonly department: string;
  readonly modelCount: number;
  readonly status: string;
}

export interface ModelCatalogResource {
  readonly modelId: string;
  readonly providerId: string;
  readonly label: string;
}

