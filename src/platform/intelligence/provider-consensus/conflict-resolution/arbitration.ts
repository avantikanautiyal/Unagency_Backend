/**
 * Conflict arbitration — discard incompatible low-scoring candidates.
 */

import { success, type Result } from "../../shared/result";
import type { ConsensusCandidate } from "../contracts/candidate";
import type { ComparisonReport } from "../contracts/comparison";
import type { IConflictArbitration } from "../interfaces/consensus";

export class DefaultConflictArbitration implements IConflictArbitration {
  arbitrate(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport
  ): Result<{ discarded: readonly string[]; conflictsResolved: number }> {
    const byId = new Map(comparison.comparisons.map((c) => [c.candidateId, c]));
    const discarded: string[] = [];

    // Discard failed executions when any success exists
    const anySuccess = candidates.some((c) => c.execution.success);
    if (anySuccess) {
      for (const c of candidates) {
        if (!c.execution.success) discarded.push(c.candidateId);
      }
    }

    // Discard extreme outliers (score < 50% of leader)
    const leader = comparison.comparisons[0];
    if (leader) {
      for (const c of comparison.comparisons.slice(1)) {
        if (c.overallScore < leader.overallScore * 0.5) {
          if (!discarded.includes(c.candidateId)) discarded.push(c.candidateId);
        }
      }
    }

    void byId;
    return success({
      discarded,
      conflictsResolved: discarded.length,
    });
  }
}
