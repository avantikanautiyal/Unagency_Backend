/**
 * Model intelligence profile — complete model understanding.
 */

import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { ModelKnowledgeProfile } from "./knowledge";

export interface ModelIntelligenceProfile {
  readonly canonical: CanonicalModel;
  readonly knowledge: ModelKnowledgeProfile;
  readonly capabilities: readonly string[];
  readonly modalities: readonly string[];
  readonly contextWindow: number;
  readonly outputWindow: number;
  readonly streaming: boolean;
  readonly reasoning: boolean;
  readonly vision: boolean;
  readonly functionCalling: boolean;
  readonly jsonMode: boolean;
  readonly toolCalling: boolean;
  readonly embeddings: boolean;
  readonly moderation: boolean;
  readonly realtime: boolean;
  readonly pricingInputPer1k: number;
  readonly pricingOutputPer1k: number;
  readonly latencyTier: string;
  readonly reliabilityScore: number;
  readonly availability: string;
  readonly regions: readonly string[];
  readonly enterpriseReady: boolean;
  readonly knownLimitations: readonly string[];
}
