/**
 * NegotiatedExecution contract — the module's primary output.
 *
 * Purpose: A fully-decided, provider-independent execution the runtime consumes.
 * Responsibilities: Carry the selected provider/model + negotiated settings.
 * Usage: Produced by IProviderNegotiationEngine; consumed by the Provider Runtime.
 * Future Extension: Multi-candidate negotiated executions.
 *
 * Contains NOTHING provider-specific beyond identifiers.
 */

import type { CapabilityId, ProviderId } from "../../../shared/identifiers";
import type { NegotiationConstraint } from "./negotiation-constraint";
import type { NegotiableFeature } from "./enums";
import type {
  BudgetEvaluation,
  QualityEvaluation,
  RegionalEvaluation,
} from "./evaluations";
import type { NegotiationEvidence, NegotiationWarning } from "./diagnostics";
import type { ExecutionProfile } from "./execution-profile";

export interface FallbackCandidate {
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly confidence: number;
  readonly reason?: string;
}

export interface NegotiatedExecution {
  readonly negotiationId: string;
  readonly capabilityId: CapabilityId;
  readonly selectedProviderId: ProviderId;
  readonly selectedModelId?: string;
  readonly executionProfile: ExecutionProfile;
  readonly negotiatedFeatures: readonly NegotiableFeature[];
  readonly rejectedFeatures: readonly NegotiableFeature[];
  readonly negotiatedConstraints: readonly NegotiationConstraint[];
  readonly negotiatedBudget: BudgetEvaluation;
  readonly regional: RegionalEvaluation;
  readonly quality: QualityEvaluation;
  readonly fallbackCandidates: readonly FallbackCandidate[];
  readonly warnings: readonly NegotiationWarning[];
  /** Negotiation confidence in [0, 1]. */
  readonly confidence: number;
  readonly evidence: readonly NegotiationEvidence[];
  readonly createdAt: string;
}
