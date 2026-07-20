/**
 * Knowledge base seed — derived from model registry canonical models.
 * Rich profiles without vendor-specific logic in code paths.
 */

import type { CanonicalModel } from "../../model-registry/contracts/model";
import { asCanonicalModelId } from "../../model-registry/contracts/identifiers";
import type { ModelKnowledgeProfile } from "../contracts/knowledge";
import type { CostTier, PerformanceTier } from "../contracts/enums";

function tierFromQuality(quality: string): PerformanceTier {
  const map: Record<string, PerformanceTier> = {
    frontier: "frontier",
    premium: "performance",
    standard: "balanced",
    economy: "economy",
  };
  return map[quality] ?? "balanced";
}

function costTier(inputPer1k: number): CostTier {
  if (inputPer1k <= 0.5) return "economy";
  if (inputPer1k <= 3) return "standard";
  if (inputPer1k <= 10) return "premium";
  return "enterprise";
}

function strengthsFor(model: CanonicalModel): string[] {
  const s: string[] = [];
  if (model.flags.reasoning) s.push("reasoning");
  if (model.flags.vision) s.push("multimodal understanding");
  if (model.flags.functionCalling) s.push("tool use");
  if (model.qualityTier === "frontier") s.push("high quality output");
  if (model.latencyTier === "ultra_low" || model.latencyTier === "low") s.push("low latency");
  if (model.departments.includes("creative" as never)) s.push("creative writing");
  if (model.departments.includes("coding" as never)) s.push("coding");
  return s.length ? s : ["general purpose"];
}

function weaknessesFor(model: CanonicalModel): string[] {
  const w: string[] = [];
  if (!model.flags.structuredOutput) w.push("weaker JSON adherence");
  if (model.latencyTier === "high") w.push("higher latency");
  if ((model.pricing.inputPer1kTokens ?? 0) > 5) w.push("higher cost");
  if (!model.flags.vision) w.push("no native vision");
  return w;
}

function useCasesFor(model: CanonicalModel): string[] {
  const cases: string[] = [];
  if (model.modalities.includes("text")) cases.push("text generation");
  if (model.flags.reasoning) cases.push("complex reasoning tasks");
  if (model.departments.includes("enterprise" as never)) cases.push("enterprise workflows");
  if (model.departments.includes("creative" as never)) cases.push("social media content");
  if (model.departments.includes("coding" as never)) cases.push("UI code generation");
  return cases;
}

export function buildKnowledgeProfile(
  model: CanonicalModel,
  nowIso: string = new Date().toISOString()
): ModelKnowledgeProfile {
  const inputPer1k = model.pricing.inputPer1kTokens ?? 0;
  return {
    modelId: asCanonicalModelId(String(model.modelId)),
    providerId: model.providerId,
    displayName: model.displayName,
    version: model.version,
    lifecycle: model.lifecycle.state,
    releaseHistory: [
      { version: model.version, releasedAt: model.lifecycle.effectiveFrom },
    ],
    knownStrengths: strengthsFor(model),
    knownWeaknesses: weaknessesFor(model),
    recommendedUseCases: useCasesFor(model),
    unsupportedFeatures: [
      ...(!model.flags.vision ? ["vision"] : []),
      ...(!model.flags.imageGeneration ? ["image generation"] : []),
      ...(!model.flags.embeddings ? ["embeddings"] : []),
    ],
    limitedFeatures: [
      ...(model.limits.maximumContext < 32000 ? ["limited context window"] : []),
    ],
    costTier: costTier(inputPer1k),
    performanceTier: tierFromQuality(model.qualityTier),
    providerCaveats: [`available in regions: ${model.regions.map((r) => r.regionId).join(", ")}`],
    enterpriseReady: model.departments.includes("enterprise" as never),
    updatedAt: nowIso,
  };
}
