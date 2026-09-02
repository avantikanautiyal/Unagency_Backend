/**
 * Negotiation result contracts.
 *
 * Purpose: The engine's returned outcome + summary + profile.
 * Responsibilities: Bundle decision, summary, negotiated execution, diagnostics.
 * Usage: Returned (wrapped in Result) by IProviderNegotiationEngine.
 * Future Extension: Ranked alternatives.
 */

import type { CapabilityId, ProviderId } from "../../../core/identifiers";
import type { NegotiationDecision } from "./enums";
import type {
  NegotiationEvidence,
  NegotiationFailure,
  NegotiationWarning,
} from "./diagnostics";
import type { NegotiatedExecution } from "./negotiated-execution";

/**
 * Engine configuration profile (thresholds + tolerances) applied to a run.
 */
export interface NegotiationProfile {
  readonly allowExperimentalCapabilities: boolean;
  readonly allowDegradedProviders: boolean;
  readonly requireHealthyProvider: boolean;
  readonly requireIdentityValidation: boolean;
  readonly defaultRegion?: string;
  readonly minConfidence: number;
}

export interface NegotiationSummary {
  readonly decision: NegotiationDecision;
  readonly confidence: number;
  readonly warningCount: number;
  readonly failureCount: number;
  readonly selectedProviderId?: ProviderId;
  readonly selectedModelId?: string;
  readonly capabilityId: CapabilityId;
}

/**
 * The full negotiation outcome. A rejection is an expected outcome (not a
 * Result failure); Result failure is reserved for malformed inputs.
 */
export interface NegotiationResult {
  readonly negotiationId: string;
  readonly decision: NegotiationDecision;
  readonly summary: NegotiationSummary;
  readonly negotiated?: NegotiatedExecution;
  readonly failures: readonly NegotiationFailure[];
  readonly warnings: readonly NegotiationWarning[];
  readonly evidence: readonly NegotiationEvidence[];
  readonly createdAt: string;
}
