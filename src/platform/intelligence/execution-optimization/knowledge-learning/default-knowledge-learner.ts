/**
 * Knowledge learner — advisory hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IKnowledgeLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultKnowledgeLearner implements IKnowledgeLearner {
  learn(
    request: ExecutionOptimizationRequest,
    _patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const intel = request.inputs.intelligenceResults ?? [];
    const recs: OptimizationRecommendation[] = [];

    for (const result of intel) {
      if (
        result.knowledgePlan.redundancyRemoved === 0 &&
        result.knowledgePlan.originalChunks > 5
      ) {
        recs.push(
          makeRecommendation(
            `rec_knowledge_ranking_${result.requestId}`,
            "knowledge_ranking",
            "Improve knowledge chunk selection",
            "No redundancy removed despite many chunks",
            "Tighten ranking and compression for knowledge budget",
            0.09,
            0.64,
            now
          )
        );
      }
    }

    const snapshots = request.inputs.knowledgeSnapshots ?? [];
    if (snapshots.some((s) => s.documents.length > 10)) {
      recs.push(
        makeRecommendation(
          "rec_knowledge_budget",
          "knowledge_ranking",
          "Enforce knowledge budget",
          "Large knowledge snapshots detected in history",
          "Limit chunk count per execution to improve focus",
          0.08,
          0.6,
          now
        )
      );
    }

    return success(recs);
  }
}
