/**
 * Confidence scoring for consensus outcomes.
 */

import { success, type Result } from "../../shared/result";
import type { ConsensusCandidate } from "../contracts/candidate";
import type { ComparisonReport } from "../contracts/comparison";
import type { IConsensusConfidenceEngine } from "../interfaces/consensus";

export class DefaultConsensusConfidenceEngine implements IConsensusConfidenceEngine {
  score(
    winner: ConsensusCandidate,
    supporting: readonly ConsensusCandidate[],
    comparison: ComparisonReport
  ): Result<{ confidence: number; agreement: number; quality: number }> {
    const winnerComp = comparison.comparisons.find(
      (c) => c.candidateId === winner.candidateId
    );
    const quality = winnerComp?.overallScore ?? 0.5;
    const topScores = comparison.comparisons.slice(0, 3).map((c) => c.overallScore);
    const agreement =
      topScores.length <= 1
        ? 1
        : 1 -
          Math.abs(topScores[0] - (topScores[1] ?? topScores[0])) /
            Math.max(topScores[0], 0.001);

    const baseConfidence =
      winner.confidence?.confidenceScore ??
      (winner.execution.success ? 0.75 : 0.4);

    const supportBoost = Math.min(0.15, supporting.length * 0.05);
    const confidence = Math.min(1, baseConfidence * 0.6 + quality * 0.3 + agreement * 0.1 + supportBoost);

    return success({ confidence, agreement, quality });
  }
}
