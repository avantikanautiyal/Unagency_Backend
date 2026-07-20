/**
 * Similarity / relevance scoring engine.
 */

import { success, type Result } from "../../shared/result";
import type { Experience } from "../../experience-intelligence/contracts/experience";
import type { ExperienceInjectionContext } from "../contracts/request";
import type { RelevanceScore } from "../contracts/scoring";
import type {
  ISimilarityEngine,
  ISemanticSimilarityEngine,
} from "../interfaces/experience-injection";
import { PlaceholderSemanticSimilarityEngine } from "./semantic-similarity";

function exactField(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return a === b ? 1 : 0;
}

function daysSince(iso: string, nowIso: string): number {
  const a = Date.parse(iso);
  const b = Date.parse(nowIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return 365;
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}

export class DefaultSimilarityEngine implements ISimilarityEngine {
  constructor(
    private readonly semantic: ISemanticSimilarityEngine = new PlaceholderSemanticSimilarityEngine(),
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  score(
    experiences: readonly Experience[],
    context: ExperienceInjectionContext
  ): Result<readonly RelevanceScore[]> {
    const now = this.nowIso();
    const contextBlob = [
      context.capabilityId,
      context.department,
      context.taskType,
      context.industry,
      context.workflowId,
    ]
      .filter(Boolean)
      .join(" ");

    const scores: RelevanceScore[] = experiences.map((e) => {
      const exactMatchScore =
        (exactField(e.capabilityId, context.capabilityId ? String(context.capabilityId) : undefined) +
          exactField(e.department, context.department) +
          exactField(e.taskType, context.taskType) +
          exactField(e.workflowId, context.workflowId) +
          exactField(e.providerId, context.providerId) +
          exactField(e.modelId, context.modelId)) /
        6;

      const applicabilityScore = e.scores.applicabilityScore;
      const confidenceScore = e.confidence;
      const total = e.successCount + e.failureCount;
      const successScore = total === 0 ? 0.5 : e.successCount / total;
      const ageDays = daysSince(e.createdAt, now);
      const recencyScore = Math.max(0, 1 - ageDays / 365);
      const frequencyScore = Math.min(1, e.usageCount / 100);
      const improvementScore = Math.min(1, Math.max(0, e.averageImprovement));
      const evidenceScore = e.scores.evidenceScore;
      const semanticScore = this.semantic.score(
        `${e.trigger} ${e.recommendation}`,
        contextBlob
      );

      const overallScore =
        exactMatchScore * 0.25 +
        applicabilityScore * 0.15 +
        confidenceScore * 0.2 +
        successScore * 0.1 +
        recencyScore * 0.05 +
        frequencyScore * 0.05 +
        improvementScore * 0.1 +
        evidenceScore * 0.05 +
        semanticScore * 0.05;

      const matchKind =
        exactMatchScore >= 0.5
          ? "exact"
          : exactMatchScore > 0
            ? "partial"
            : semanticScore > 0.2
              ? "semantic_placeholder"
              : "none";

      return Object.freeze({
        experienceId: e.experienceId,
        exactMatchScore,
        applicabilityScore,
        confidenceScore,
        successScore,
        recencyScore,
        frequencyScore,
        improvementScore,
        evidenceScore,
        semanticScore,
        overallScore,
        matchKind,
      });
    });

    return success(scores.sort((a, b) => b.overallScore - a.overallScore));
  }
}
