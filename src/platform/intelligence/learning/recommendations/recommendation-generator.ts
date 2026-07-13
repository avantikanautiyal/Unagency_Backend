/**
 * Recommendation generator — recommendations never modify modules.
 */

import { randomUUID } from "crypto";
import { success } from "../../shared/result";
import type { Result } from "../../shared/result";
import type {
  AffectedModule,
  LearningEvidence,
  LearningPattern,
  LearningRecommendation,
  LearningSignal,
  RecommendationType,
} from "../contracts/learning-models";
import type {
  IRecommendationGenerator,
  RecommendationInput,
} from "../interfaces/learning-ports";

export class PlaceholderRecommendationGenerator implements IRecommendationGenerator {
  generate(input: RecommendationInput): Result<readonly LearningRecommendation[]> {
    const recommendations: LearningRecommendation[] = [];

    for (const pattern of input.patterns) {
      const rec = patternToRecommendation(pattern, input.signals, input.request.scope);
      if (rec) recommendations.push(rec);
    }

    const lowQualitySignals = input.signals.filter((s) => s.normalizedValue < 0.4);
    if (lowQualitySignals.length >= 2) {
      recommendations.push(
        buildRecommendation({
          type: "quality_alert",
          reason: `${lowQualitySignals.length} low-quality signals detected across artifacts`,
          confidence: 0.7,
          affectedModule: "evaluation",
          scope: input.request.scope,
          signalIds: lowQualitySignals.map((s) => s.signalId),
          evidence: lowQualitySignals.map((s) => evidenceFromSignal(s)),
        })
      );
    }

    return success(recommendations);
  }
}

function patternToRecommendation(
  pattern: LearningPattern,
  signals: readonly LearningSignal[],
  scope: RecommendationInput["request"]["scope"]
): LearningRecommendation | undefined {
  const mapping: Record<
    LearningPattern["kind"],
    { type: RecommendationType; module: AffectedModule; reason: string }
  > = {
    quality_degradation: {
      type: "quality_alert",
      module: "evaluation",
      reason: "Recurring quality degradation pattern detected",
    },
    latency_spike: {
      type: "latency_alert",
      module: "execution-runtime",
      reason: "Latency spike pattern detected across executions",
    },
    cost_increase: {
      type: "cost_alert",
      module: "providers",
      reason: "Cost increase pattern detected",
    },
    brand_drift: {
      type: "brand_alignment",
      module: "prompt-compiler",
      reason: "Brand drift pattern detected in intelligence outputs",
    },
    evaluation_failure: {
      type: "investigation",
      module: "evaluation",
      reason: "Evaluation failure pattern requires investigation",
    },
    human_review_spike: {
      type: "investigation",
      module: "gateway",
      reason: "Elevated human review signals detected",
    },
    routing_imbalance: {
      type: "routing_adjustment",
      module: "orchestrator",
      reason: "Routing imbalance pattern detected",
    },
    recurring_failure: {
      type: "improvement",
      module: "execution-runtime",
      reason: "Recurring failure pattern across artifacts",
    },
  };

  const config = mapping[pattern.kind];
  if (!config) return undefined;

  const relatedSignals = signals.filter((s) => pattern.signalIds.includes(s.signalId));

  return buildRecommendation({
    type: config.type,
    reason: config.reason,
    confidence: pattern.confidence,
    affectedModule: config.module,
    scope,
    signalIds: pattern.signalIds,
    patternId: pattern.patternId,
    evidence: relatedSignals.map((s) => evidenceFromSignal(s)),
  });
}

function evidenceFromSignal(signal: LearningSignal): LearningEvidence {
  return {
    evidenceId: `lev_${randomUUID()}`,
    artifactId: signal.sourceArtifactId,
    artifactType: signal.sourceArtifactType,
    description: signal.label,
    metric: signal.kind,
    value: signal.normalizedValue,
    observedAt: signal.extractedAt,
  };
}

function buildRecommendation(input: {
  type: RecommendationType;
  reason: string;
  confidence: number;
  affectedModule: AffectedModule;
  scope: RecommendationInput["request"]["scope"];
  signalIds: readonly string[];
  patternId?: string;
  evidence: readonly LearningEvidence[];
}): LearningRecommendation {
  return {
    recommendationId: `lrec_${randomUUID()}`,
    type: input.type,
    reason: input.reason,
    confidence: input.confidence,
    evidence: input.evidence,
    affectedModule: input.affectedModule,
    applicableScope: input.scope,
    signalIds: input.signalIds,
    patternId: input.patternId,
    generatedAt: new Date().toISOString(),
  };
}
