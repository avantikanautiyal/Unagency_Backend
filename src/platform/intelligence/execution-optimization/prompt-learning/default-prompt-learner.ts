/**
 * Prompt learner — advisory improvement hints only.
 */

import { success, type Result } from "../../shared/result";
import type { OptimizationRecommendation } from "../contracts/recommendation";
import type { ExecutionPattern } from "../contracts/patterns";
import type { ExecutionOptimizationRequest } from "../contracts/request";
import type { IPromptLearner } from "../interfaces/execution-optimization";
import { makeRecommendation } from "../heuristics/learner-helpers";

export class DefaultPromptLearner implements IPromptLearner {
  learn(
    request: ExecutionOptimizationRequest,
    patterns: readonly ExecutionPattern[]
  ): Result<readonly OptimizationRecommendation[]> {
    const now = new Date().toISOString();
    const recs: OptimizationRecommendation[] = [];
    const metadata = request.inputs.promptMetadata ?? [];
    const qualityPattern = patterns.find((p) => p.id === "pat_quality_low");

    for (const meta of metadata) {
      if (meta.sectionCount < 3 && qualityPattern) {
        recs.push(
          makeRecommendation(
            `rec_prompt_structure_${meta.templateId}`,
            "prompt_structure",
            "Strengthen prompt structure",
            `Template ${meta.templateId} has only ${meta.sectionCount} sections`,
            "Add instructions and output sections to improve quality",
            0.1,
            0.65,
            now
          )
        );
      }
      if (meta.constraintCount === 0) {
        recs.push(
          makeRecommendation(
            `rec_prompt_constraints_${meta.templateId}`,
            "prompt_structure",
            "Add output constraints",
            `Template ${meta.templateId} has no constraints`,
            "Schema or formatting constraints reduce evaluation failures",
            0.08,
            0.6,
            now
          )
        );
      }
    }

    return success(recs);
  }
}
