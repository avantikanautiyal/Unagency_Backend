/**
 * Build consensus explainability report.
 */

import type { ConsensusCandidate } from "../contracts/candidate";
import type { ComparisonReport } from "../contracts/comparison";
import type { ConsensusExplanation } from "../contracts/explainability";
import type { ConsensusStrategyKind } from "../contracts/enums";

export function buildConsensusExplanation(input: {
  readonly strategy: ConsensusStrategyKind;
  readonly winner: ConsensusCandidate;
  readonly supporting: readonly ConsensusCandidate[];
  readonly losers: readonly ConsensusCandidate[];
  readonly comparison: ComparisonReport;
  readonly conflictsResolved: number;
}): ConsensusExplanation {
  const { strategy, winner, supporting, losers, comparison, conflictsResolved } = input;
  const winnerScore =
    comparison.comparisons.find((c) => c.candidateId === winner.candidateId)?.overallScore ?? 0;

  const perProvider = [
    {
      providerId: winner.providerId,
      candidateId: winner.candidateId,
      outcome: "won" as const,
      reason: `Selected by ${strategy} with score ${winnerScore.toFixed(3)}`,
      score: winnerScore,
    },
    ...supporting.map((s) => ({
      providerId: s.providerId,
      candidateId: s.candidateId,
      outcome: "contributed" as const,
      reason: `Contributed via merge as ${s.role ?? "supporting"}`,
      score: comparison.comparisons.find((c) => c.candidateId === s.candidateId)?.overallScore,
    })),
    ...losers.map((l) => ({
      providerId: l.providerId,
      candidateId: l.candidateId,
      outcome: "lost" as const,
      reason: `Not selected under ${strategy}`,
      score: comparison.comparisons.find((c) => c.candidateId === l.candidateId)?.overallScore,
    })),
  ];

  return Object.freeze({
    summary: `Consensus via ${strategy}: winner=${winner.providerId}`,
    strategyRationale: comparison.rationale,
    whyWinner: `${winner.providerId} won under ${strategy} (score=${winnerScore.toFixed(3)})`,
    whyLosers: losers.map(
      (l) =>
        `${l.providerId} lost: lower composite score or not preferred by strategy ${strategy}`
    ),
    contributions: supporting.map(
      (s) => `${s.providerId} contributed content/role=${s.role ?? "supporting"}`
    ),
    tradeoffs: [
      conflictsResolved > 0
        ? `${conflictsResolved} conflicting/low-quality candidates discarded`
        : "No hard conflicts discarded",
      "Consensus never merges blindly — merge mode is explicit and explainable",
    ],
    evidence: [
      ...comparison.comparisons.map(
        (c) => `${c.providerId}: overall=${c.overallScore.toFixed(3)} rank=${c.rank}`
      ),
    ],
    perProvider,
  });
}
