/**
 * Priority ranking.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { PrioritizationScore, RelevanceScore } from "../contracts/scoring";
import type { IPrioritizer } from "../interfaces/experience-injection";

export class DefaultPrioritizer implements IPrioritizer {
  prioritize(
    experiences: readonly Experience[],
    scores: readonly RelevanceScore[]
  ): Result<readonly PrioritizationScore[]> {
    const scoreMap = new Map(scores.map((s) => [String(s.experienceId), s]));

    const priorities = experiences.map((e) => {
      const rel = scoreMap.get(String(e.experienceId));
      const confidence = e.confidence;
      const improvement = e.averageImprovement;
      const evidence = e.scores.evidenceScore;
      const frequency = Math.min(1, e.usageCount / 50);
      const humanApproval = e.lifecycle === "preferred" || e.lifecycle === "trusted" ? 1 : 0.5;
      const recency = rel?.recencyScore ?? 0.5;
      const applicability = e.scores.applicabilityScore;
      const relevance = rel?.overallScore ?? 0;

      const priority =
        confidence * 0.2 +
        improvement * 0.15 +
        evidence * 0.15 +
        frequency * 0.1 +
        humanApproval * 0.1 +
        recency * 0.1 +
        applicability * 0.1 +
        relevance * 0.1;

      return {
        experienceId: e.experienceId,
        priority,
        rank: 0,
        factors: Object.freeze({
          confidence,
          improvement,
          evidence,
          frequency,
          humanApproval,
          recency,
          applicability,
          relevance,
        }),
      };
    });

    priorities.sort((a, b) => b.priority - a.priority);
    const ranked: PrioritizationScore[] = priorities.map((p, i) =>
      Object.freeze({ ...p, rank: i + 1 })
    );

    return success(ranked);
  }
}
