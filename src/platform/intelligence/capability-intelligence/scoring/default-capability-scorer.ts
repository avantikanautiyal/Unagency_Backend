/**
 * Capability scoring.
 */

import { success, type Result } from "../../shared/result";
import type { CapabilityDefinitionRecord, CapabilityEvolutionMetrics } from "../contracts/capability";
import type { CapabilityScorecard } from "../contracts/scoring";
import type { ICapabilityScorer } from "../interfaces/capability-intelligence";
import { SCORE_WEIGHTS } from "../constants";
import type { CapabilityMaturity, CostTier, LatencyTier, ComplexityTier } from "../contracts/enums";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function maturityScore(m: CapabilityMaturity): number {
  switch (m) {
    case "enterprise":
      return 1;
    case "stable":
      return 0.85;
    case "preview":
      return 0.6;
    case "experimental":
      return 0.4;
    case "deprecated":
      return 0.15;
    default:
      return 0.5;
  }
}

function costScore(t: CostTier): number {
  switch (t) {
    case "low":
      return 1;
    case "medium":
      return 0.75;
    case "high":
      return 0.45;
    case "premium":
      return 0.25;
    default:
      return 0.5;
  }
}

function latencyScore(t: LatencyTier): number {
  switch (t) {
    case "realtime":
      return 1;
    case "fast":
      return 0.85;
    case "standard":
      return 0.65;
    case "batch":
      return 0.4;
    default:
      return 0.5;
  }
}

function coverageScore(c: CapabilityDefinitionRecord): number {
  let n = 0;
  if (c.inputs.length) n += 0.2;
  if (c.outputs.length) n += 0.2;
  if (c.keywords.length) n += 0.2;
  if (c.requiredEvaluators.length) n += 0.2;
  if (c.description.length > 20) n += 0.2;
  return clamp01(n);
}

function reusabilityScore(c: CapabilityDefinitionRecord, complexity: ComplexityTier): number {
  const depPenalty = Math.min(0.4, c.dependencies.length * 0.1);
  const complexityPenalty =
    complexity === "simple" ? 0 : complexity === "moderate" ? 0.1 : complexity === "complex" ? 0.2 : 0.3;
  return clamp01(0.9 - depPenalty - complexityPenalty);
}

export class DefaultCapabilityScorer implements ICapabilityScorer {
  score(
    capability: CapabilityDefinitionRecord,
    evolution?: CapabilityEvolutionMetrics
  ): Result<CapabilityScorecard> {
    const quality = clamp01(
      evolution?.averageQuality ?? capability.qualityExpectations.minQuality
    );
    const cost = costScore(capability.costTier);
    const latency = latencyScore(capability.latencyTier);
    const reliability = clamp01(
      evolution?.successRate ?? capability.qualityExpectations.minReliability
    );
    const coverage = coverageScore(capability);
    const reusability = reusabilityScore(capability, capability.complexity);
    const maturity = maturityScore(capability.maturity);

    const overall = clamp01(
      quality * SCORE_WEIGHTS.quality +
        cost * SCORE_WEIGHTS.cost +
        latency * SCORE_WEIGHTS.latency +
        reliability * SCORE_WEIGHTS.reliability +
        coverage * SCORE_WEIGHTS.coverage +
        reusability * SCORE_WEIGHTS.reusability +
        maturity * SCORE_WEIGHTS.maturity
    );

    return success({
      capabilityId: capability.capabilityId,
      scores: {
        quality,
        cost,
        latency,
        reliability,
        coverage,
        reusability,
        maturity,
        overall,
      },
      rationale: `Scored ${capability.capabilityId} overall=${overall.toFixed(3)} (maturity=${capability.maturity}, cost=${capability.costTier}, latency=${capability.latencyTier}).`,
    });
  }
}
