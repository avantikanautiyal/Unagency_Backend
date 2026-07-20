/**
 * Dynamic judge weighting profiles.
 */

import { success, type Result } from "../../shared/result";
import type {
  DynamicEvaluationStrategy,
  JudgeExecutionPlan,
  JudgeWeightEntry,
  JudgeWeightProfile,
} from "../contracts/dynamic-evaluation";
import type { JudgeKind } from "../contracts/evaluation-models";
import type { IJudgeWeightingEngine } from "../interfaces/dynamic-evaluation-ports";

/** Canonical relative weights by family (normalized later). */
const FAMILY_WEIGHTS: Record<string, Partial<Record<JudgeKind, number>>> = {
  marketing: {
    creative: 0.4,
    grammar: 0.1,
    brand: 0.3,
    safety: 0.2,
    marketing: 0.25,
    social_media: 0.15,
    accessibility: 0.1,
    human: 0.05,
  },
  software: {
    architecture: 0.3,
    security: 0.3,
    testing: 0.2,
    performance: 0.2,
    maintainability: 0.15,
    code_quality: 0.15,
    safety: 0.1,
    human: 0.05,
  },
  healthcare: {
    medical: 0.3,
    factual: 0.25,
    compliance: 0.2,
    safety: 0.15,
    hallucination: 0.1,
    policy: 0.1,
    human: 0.1,
  },
  legal: {
    legal: 0.35,
    policy: 0.2,
    compliance: 0.2,
    factual: 0.15,
    safety: 0.1,
    human: 0.1,
  },
  finance: {
    finance: 0.35,
    factual: 0.25,
    compliance: 0.2,
    safety: 0.1,
    human: 0.1,
  },
  research: {
    research: 0.3,
    factual: 0.25,
    reasoning: 0.2,
    hallucination: 0.15,
    grammar: 0.1,
    human: 0.05,
  },
  media: {
    image_quality: 0.25,
    video_quality: 0.25,
    audio_quality: 0.15,
    creative: 0.15,
    accessibility: 0.1,
    safety: 0.1,
    human: 0.05,
  },
  general: {
    instruction: 0.2,
    brand: 0.15,
    policy: 0.15,
    grammar: 0.1,
    safety: 0.2,
    factual: 0.1,
    hallucination: 0.1,
    human: 0.05,
  },
};

export class DefaultJudgeWeightingEngine implements IJudgeWeightingEngine {
  weight(
    strategy: DynamicEvaluationStrategy,
    plan: JudgeExecutionPlan
  ): Result<JudgeWeightProfile> {
    const seed = FAMILY_WEIGHTS[strategy.pipelineFamily] ?? FAMILY_WEIGHTS.general;
    const raw: JudgeWeightEntry[] = plan.selectedJudges.map((j) => {
      const weight = seed?.[j.kind] ?? 0.1;
      const required =
        j.kind === "safety" ||
        j.kind === "security" ||
        j.kind === "medical" ||
        j.kind === "compliance" ||
        (strategy.humanApprovalRequired && j.kind === "human");
      const threshold =
        strategy.riskLevel === "critical" || strategy.riskLevel === "high" ? 0.8 : 0.65;
      return {
        kind: j.kind,
        weight,
        threshold,
        required,
        rationale: `Weight from ${strategy.pipelineFamily} profile for ${j.kind}.`,
      };
    });

    const total = raw.reduce((s, e) => s + e.weight, 0) || 1;
    const entries = raw.map((e) => ({
      ...e,
      weight: e.weight / total,
    }));

    return success({
      profileId: `weights_${strategy.pipelineFamily}`,
      entries,
      normalized: true,
      rationale: `Normalized weights for ${strategy.pipelineFamily} (${entries.length} judges).`,
    });
  }
}
