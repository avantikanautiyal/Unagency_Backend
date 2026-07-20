/**
 * Complexity engine.
 */

import { success, type Result } from "../../shared/result";
import type { ComplexityProfile } from "../contracts/complexity";
import type { ComplexityTier } from "../contracts/enums";
import type { TaskNode } from "../contracts/task";
import type { IComplexityEngine } from "../interfaces/task-intelligence";

export class DefaultComplexityEngine implements IComplexityEngine {
  analyze(prompt: string, nodes: readonly TaskNode[]): Result<ComplexityProfile> {
    const count = nodes.length;
    const reviewGates = nodes.filter((n) => n.requiresReview).length;
    const tier: ComplexityTier =
      count >= 12 ? "enterprise" : count >= 8 ? "complex" : count >= 4 ? "moderate" : "simple";

    const executionComplexity = Math.min(1, count / 15);
    const humanInvolvement = Math.min(1, reviewGates / Math.max(1, count));

    return success({
      tier,
      reasoningComplexity: tier === "enterprise" ? 0.85 : 0.6,
      knowledgeComplexity: prompt.length > 100 ? 0.7 : 0.5,
      executionComplexity,
      outputComplexity: Math.min(1, count / 10),
      humanInvolvement,
      confidence: 0.8,
      estimatedDurationMinutes: count * 45 + reviewGates * 30,
      rationale: `${count} tasks with ${reviewGates} review gates → ${tier} complexity`,
    });
  }
}
