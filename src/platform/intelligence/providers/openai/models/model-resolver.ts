/**
 * OpenAI Model Resolver — mandatory for every provider integration.
 * Maps DesiredCapabilityProfile → best currently available discovered model.
 * Never hardcodes gpt-4 / gpt-5 as Intelligence OS targets.
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type {
  DesiredCapabilityProfile,
  DiscoveredOpenAIModel,
  OpenAIModelResolution,
} from "../contracts/openai-contracts";

export interface IOpenAIModelResolver {
  resolve(
    profile: DesiredCapabilityProfile,
    inventory: readonly DiscoveredOpenAIModel[]
  ): Result<OpenAIModelResolution>;
}

export class OpenAIModelResolver implements IOpenAIModelResolver {
  constructor(private readonly nowIso: () => string = () => new Date().toISOString()) {}

  resolve(
    profile: DesiredCapabilityProfile,
    inventory: readonly DiscoveredOpenAIModel[]
  ): Result<OpenAIModelResolution> {
    if (inventory.length === 0) {
      return failure(new ValidationError("No discovered OpenAI models available"));
    }

    const eligible = inventory.filter((m) => {
      if (m.lifecycle === "deprecated" || m.lifecycle === "legacy") return false;
      const c = m.capability;
      if (profile.requireStreaming && !c.streaming) return false;
      if (profile.requireToolCalling && !c.toolCalling) return false;
      if (profile.requireVision && !c.vision) return false;
      if (profile.requireAudio && !c.audio) return false;
      if (profile.requireEmbeddings && !c.embeddings) return false;
      if (profile.requireReasoning && !c.reasoning) return false;
      if (profile.requireStructuredOutputs && !c.structuredOutputs) return false;
      if (profile.requireJsonMode && !c.jsonMode) return false;
      if (
        profile.minContextWindow &&
        (c.contextWindow ?? 0) < profile.minContextWindow
      ) {
        return false;
      }
      if (profile.modality === "embedding" && !c.embeddings) return false;
      if (profile.modality === "image" && !m.modalities.includes("image") && !c.vision)
        return false;
      if (profile.modality === "audio" && !c.audio) return false;
      if (profile.modality === "text" && c.embeddings) return false;
      return true;
    });

    const pool = eligible.length > 0 ? eligible : inventory.filter((m) => m.lifecycle === "active");
    if (pool.length === 0) {
      return failure(new ValidationError("No eligible OpenAI models for capability profile"));
    }

    const scored = pool
      .map((m) => ({ model: m, score: this.score(m, profile) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    return success({
      selectedModelId: best.model.id,
      candidates: scored.slice(0, 5).map((s) => s.model.id),
      score: best.score,
      rationale: this.rationale(best.model, profile, best.score),
      profile,
      resolvedAt: this.nowIso(),
    });
  }

  private score(model: DiscoveredOpenAIModel, profile: DesiredCapabilityProfile): number {
    let score = 0;
    const c = model.capability;
    if (c.toolCalling) score += 10;
    if (c.structuredOutputs) score += 8;
    if (c.streaming) score += 5;
    if (c.vision && profile.requireVision) score += 20;
    if (c.reasoning && (profile.requireReasoning || profile.preferReasoning)) score += 25;
    if (c.embeddings && profile.requireEmbeddings) score += 30;
    if (c.audio && profile.requireAudio) score += 20;
    score += Math.min(20, (c.contextWindow ?? 0) / 10_000);

    const cost = model.pricing?.inputPerMillion ?? 5;
    if (profile.maxCostPreference === "low") score += Math.max(0, 15 - cost);
    else if (profile.maxCostPreference === "quality") score += cost > 5 ? 10 : 0;
    else score += 5;

    if (model.id.includes("mini") && profile.maxCostPreference !== "quality") score += 3;
    if (model.lifecycle === "preview") score -= 5;
    return score;
  }

  private rationale(
    model: DiscoveredOpenAIModel,
    profile: DesiredCapabilityProfile,
    score: number
  ): string {
    return `Selected ${model.id} (score=${score.toFixed(1)}) for capability profile modality=${profile.modality ?? "text"} streaming=${!!profile.requireStreaming} tools=${!!profile.requireToolCalling} reasoning=${!!(profile.requireReasoning || profile.preferReasoning)}`;
  }
}
