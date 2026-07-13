/**
 * Compatibility contracts.
 *
 * Purpose: Immutable outputs of capability/provider/model/feature analysis.
 * Responsibilities: Describe what is / is not compatible and why.
 * Usage: Produced by the respective negotiators; embedded in evidence.
 * Future Extension: Cost/latency hints per compatibility dimension.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type {
  MaturityLevel,
  NegotiableFeature,
} from "./enums";

export interface CapabilityCompatibility {
  readonly capabilityId: CapabilityId;
  readonly exists: boolean;
  readonly enabled: boolean;
  readonly maturity: MaturityLevel;
  readonly compatible: boolean;
  readonly requiredPermissions: readonly string[];
  readonly humanReviewRequired: boolean;
  readonly reasons: readonly string[];
}

export interface ProviderCompatibility {
  readonly providerId: ProviderId;
  readonly supported: boolean;
  readonly available: boolean;
  readonly maturity: MaturityLevel;
  readonly healthy: boolean;
  readonly compatible: boolean;
  readonly restricted: boolean;
  readonly reasons: readonly string[];
}

export interface ModelCompatibility {
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly available: boolean;
  readonly contextWindow?: number;
  readonly supportsStreaming: boolean;
  readonly supportsReasoning: boolean;
  readonly supportsVision: boolean;
  readonly supportsAudio: boolean;
  readonly supportsEmbeddings: boolean;
  readonly supportsStructuredOutput: boolean;
  readonly supportsFunctionCalling: boolean;
  readonly supportsJsonMode: boolean;
  readonly supportsToolUse: boolean;
  readonly reasons: readonly string[];
}

export interface FeatureCompatibility {
  readonly requested: readonly NegotiableFeature[];
  readonly negotiated: readonly NegotiableFeature[];
  readonly rejected: readonly NegotiableFeature[];
  readonly reasons: readonly string[];
}
