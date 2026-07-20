/**
 * Model Knowledge Base — rich intelligence profile per model.
 */

import type { CanonicalModelId } from "../../model-registry/contracts/identifiers";
import type { ProviderId } from "../../shared/identifiers";
import type { CostTier, PerformanceTier } from "./enums";

export interface ModelReleaseHistoryEntry {
  readonly version: string;
  readonly releasedAt: string;
  readonly changelog?: string;
  readonly deprecated?: boolean;
}

export interface ModelKnowledgeProfile {
  readonly modelId: CanonicalModelId;
  readonly providerId: ProviderId;
  readonly displayName: string;
  readonly version: string;
  readonly lifecycle: string;
  readonly releaseHistory: readonly ModelReleaseHistoryEntry[];
  readonly knownStrengths: readonly string[];
  readonly knownWeaknesses: readonly string[];
  readonly recommendedUseCases: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly limitedFeatures: readonly string[];
  readonly costTier: CostTier;
  readonly performanceTier: PerformanceTier;
  readonly providerCaveats: readonly string[];
  readonly enterpriseReady: boolean;
  readonly updatedAt: string;
}
