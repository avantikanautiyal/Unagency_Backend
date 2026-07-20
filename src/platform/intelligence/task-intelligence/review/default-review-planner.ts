/**
 * Review planner.
 */

import { success, type Result } from "../../shared/result";
import type { ReviewPlan, ReviewCheckpoint } from "../contracts/review";
import type { QualityRequirements } from "../contracts/quality";
import type { TaskNode } from "../contracts/task";
import type { IReviewPlanner } from "../interfaces/task-intelligence";

export class DefaultReviewPlanner implements IReviewPlanner {
  constructor(private readonly createId: (prefix: string) => string = (p) => `${p}_1`) {}

  plan(nodes: readonly TaskNode[], quality: QualityRequirements): Result<ReviewPlan> {
    const checkpoints: ReviewCheckpoint[] = nodes
      .filter((n) => n.requiresReview || n.nodeKind !== "task")
      .map((n) => ({
        checkpointId: this.createId(`chk_${n.nodeId}`),
        nodeId: n.nodeId,
        gate: n.nodeKind === "approval_gate" ? "approval" : n.nodeKind === "validation_gate" ? "validation" : "human_review",
        description: `Review ${n.title} before downstream execution`,
        required: true,
        rationale: quality.reviewRequired
          ? "Launch workflow requires human review at key gates"
          : "Review recommended for quality assurance",
      }));

    return success({
      planId: this.createId("review_plan"),
      checkpoints,
      humanReviewRequired: checkpoints.length > 0,
      approvalRequired: checkpoints.some((c) => c.gate === "approval"),
      rationale: `${checkpoints.length} review checkpoints based on task graph and quality requirements`,
    });
  }
}
