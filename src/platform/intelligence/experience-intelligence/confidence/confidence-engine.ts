/**
 * Confidence engine — scores experience confidence.
 */

import { success, type Result } from "../../shared/result";
import type { ExperienceScores } from "../contracts/scoring";
import type { Experience } from "../contracts/experience";
import type { ExperienceIntelligenceInputs } from "../contracts/inputs";
import type { IExperienceConfidenceEngine } from "../interfaces/experience-intelligence";

export class DefaultExperienceConfidenceEngine implements IExperienceConfidenceEngine {
  score(
    inputs: ExperienceIntelligenceInputs,
    experience: Experience
  ): Result<ExperienceScores> {
    const executionCount = (inputs.evaluationReports?.length ?? 0) + (inputs.observabilityReports?.length ?? 0);
    const successRate =
      experience.successCount / Math.max(1, experience.successCount + experience.failureCount);
    const evidenceQuality = Math.min(1, experience.evidence.length * 0.2);
    const humanApproval = (inputs.reviewDecisions ?? []).some((r) => r.disposition === "skip") ? 0.5 : 0.8;
    const recency = 0.85;

    const confidence = Math.min(
      1,
      (successRate * 0.3 + evidenceQuality * 0.25 + humanApproval * 0.2 + recency * 0.15 + experience.confidence * 0.1)
    );

    return success(
      Object.freeze({
        confidence,
        evidenceScore: evidenceQuality,
        impactScore: experience.scores.impactScore,
        reuseScore: Math.min(1, executionCount / 100),
        improvementScore: experience.averageImprovement,
        applicabilityScore: experience.applicableConditions.capabilityId ? 0.85 : 0.5,
      })
    );
  }
}
