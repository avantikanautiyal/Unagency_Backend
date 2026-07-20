/**
 * Profile builder.
 */

import { success, type Result } from "../../shared/result";
import type { CanonicalModel } from "../../model-registry/contracts/model";
import type { ModelIntelligenceProfile } from "../contracts/profile";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { IProfileBuilder } from "../interfaces/model-intelligence";

export class DefaultProfileBuilder implements IProfileBuilder {
  build(model: CanonicalModel, knowledge: ModelKnowledgeProfile): Result<ModelIntelligenceProfile> {
    return success({
      canonical: model,
      knowledge,
      capabilities: model.capabilities.map((c) => c.capabilityId),
      modalities: model.modalities.map(String),
      contextWindow: model.limits.maximumContext,
      outputWindow: model.limits.maximumOutput,
      streaming: model.flags.streaming,
      reasoning: model.flags.reasoning,
      vision: model.flags.vision,
      functionCalling: model.flags.functionCalling,
      jsonMode: model.flags.structuredOutput,
      toolCalling: model.flags.functionCalling,
      embeddings: model.flags.embeddings,
      moderation: false,
      realtime: false,
      pricingInputPer1k: model.pricing.inputPer1kTokens ?? 0,
      pricingOutputPer1k: model.pricing.outputPer1kTokens ?? 0,
      latencyTier: model.latencyTier,
      reliabilityScore: 0.9,
      availability: model.availability,
      regions: model.regions.map((r) => r.regionId),
      enterpriseReady: knowledge.enterpriseReady,
      knownLimitations: knowledge.knownWeaknesses,
    });
  }
}
