/**
 * Capability definition model.
 *
 * Purpose: Complete immutable description of a platform capability.
 * Responsibilities: Hold all metadata required for registration and discovery.
 * Usage: Built via CapabilityBuilder; stored in CapabilityRegistry.
 * Future Extension: Localization, marketplace ratings.
 */

import type { CapabilityId, ProviderId } from "../../core/identifiers";
import type { CapabilityConstraints } from "./capability-constraints";
import type { CapabilityPolicyReferences } from "./capability-policies";
import type { CapabilityStatus } from "./capability-status";

export type CapabilityVisibility = "public" | "internal" | "private";

export type CapabilityModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "structured"
  | "embedding"
  | "multimodal";

export type CapabilitySecurityClassification =
  | "public"
  | "internal"
  | "confidential"
  | "restricted"
  | "pii";

/**
 * JSON-schema-like contract reference (not a runtime validator).
 */
export interface CapabilitySchema {
  readonly schemaId?: string;
  readonly schemaVersion?: string;
  readonly contentTypes: readonly string[];
  readonly description?: string;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
}

export interface CapabilityProviderCompatibility {
  readonly compatibleProviderIds: readonly ProviderId[];
}

export interface CapabilityTimeoutPolicy {
  readonly timeoutMs: number;
}

export interface CapabilityRetryPolicyInline {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly strategy: "none" | "fixed" | "exponential";
}

export interface CapabilityEvaluationStrategyInline {
  readonly enabled: boolean;
  readonly sampleRate?: number;
  readonly criteria?: readonly string[];
}

export interface CapabilityCostLimitInline {
  readonly maxCost?: number;
  readonly maxTokens?: number;
  readonly currency?: string;
}

export interface CapabilityHumanReviewPolicyInline {
  readonly required: boolean;
  readonly reason?: string;
}

/**
 * Complete capability definition — registry source of truth entry.
 */
export interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly name: string;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: string;
  readonly subcategory?: string;
  readonly tags: readonly string[];
  readonly status: CapabilityStatus;
  readonly owner: string;
  readonly visibility: CapabilityVisibility;
  readonly inputSchema: CapabilitySchema;
  readonly outputSchema: CapabilitySchema;
  readonly configurationSchema?: CapabilitySchema;
  readonly supportedModalities: readonly CapabilityModality[];
  readonly providerCompatibility: CapabilityProviderCompatibility;
  readonly defaultProvider?: ProviderId;
  readonly fallbackProviders: readonly ProviderId[];
  readonly timeout: CapabilityTimeoutPolicy;
  readonly retryPolicy: CapabilityRetryPolicyInline;
  readonly evaluationStrategy: CapabilityEvaluationStrategyInline;
  readonly costLimit: CapabilityCostLimitInline;
  readonly humanReviewPolicy: CapabilityHumanReviewPolicyInline;
  readonly securityClassification: CapabilitySecurityClassification;
  readonly requiredPermissions: readonly string[];
  readonly constraints: CapabilityConstraints;
  readonly policies: CapabilityPolicyReferences;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deprecatedAt?: string;
}
