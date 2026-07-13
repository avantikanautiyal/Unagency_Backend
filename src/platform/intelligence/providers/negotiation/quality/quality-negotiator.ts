/**
 * Quality negotiator.
 *
 * Purpose: Validate quality requirements (confidence, evaluation, review, risk).
 * Responsibilities: Derive risk level and check it against requested tolerance.
 * Usage: Quality stage of the negotiation pipeline.
 * Future Extension: Historical evaluation-score lookups.
 */

import type { CapabilitySecurityClassification } from "../../../capability-registry/contracts/capability-definition";
import type { ICapabilityRegistry } from "../../../capability-registry/interfaces/capability-registry";
import { success, type Result } from "../../../shared/result";
import type { QualityEvaluation } from "../contracts/evaluations";
import type { RiskLevel } from "../contracts/enums";
import type { NegotiationContext } from "../interfaces/context";
import type { IQualityNegotiator } from "../interfaces/negotiators";

const RISK_ORDER: readonly RiskLevel[] = ["low", "medium", "high", "critical"];

function riskRank(level: RiskLevel): number {
  return RISK_ORDER.indexOf(level);
}

function riskOf(classification: CapabilitySecurityClassification): RiskLevel {
  switch (classification) {
    case "public":
    case "internal":
      return "low";
    case "confidential":
      return "medium";
    case "restricted":
      return "high";
    case "pii":
      return "critical";
    default:
      return "low";
  }
}

export class QualityNegotiator implements IQualityNegotiator {
  constructor(private readonly capabilityRegistry: ICapabilityRegistry) {}

  negotiate(context: NegotiationContext): Result<QualityEvaluation> {
    const plan = context.request.plan;
    const quality = context.request.quality;
    const reasons: string[] = [];

    const capabilityResult = this.capabilityRegistry.resolve(plan.capabilityId);
    const capability = capabilityResult.ok ? capabilityResult.value : undefined;

    const riskLevel = capability
      ? riskOf(capability.securityClassification)
      : "low";

    const humanReviewRequired =
      quality?.requireHumanReview === true ||
      plan.humanReview.required ||
      capability?.humanReviewPolicy.required === true;

    let satisfied = true;
    if (
      quality?.maxRiskLevel &&
      riskRank(riskLevel) > riskRank(quality.maxRiskLevel)
    ) {
      satisfied = false;
      reasons.push(
        `risk level '${riskLevel}' exceeds max '${quality.maxRiskLevel}'`
      );
    }

    return success({
      satisfied,
      minConfidence: quality?.minConfidence,
      minEvaluationScore: quality?.minEvaluationScore,
      humanReviewRequired,
      riskLevel,
      reasons,
    });
  }
}
