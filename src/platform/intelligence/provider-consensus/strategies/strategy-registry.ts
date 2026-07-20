/**
 * Consensus strategy implementations.
 */

import { failure, success, type Result } from "../../shared/result";
import { ValidationError } from "../../shared/errors";
import type { ConsensusCandidate } from "../contracts/candidate";
import type { ComparisonReport } from "../contracts/comparison";
import type { ConsensusStrategyKind, MergeMode } from "../contracts/enums";
import type { ConsensusResult } from "../contracts/result";
import type { IConsensusStrategy, IMergeEngine } from "../interfaces/consensus";

type Decision = Pick<
  ConsensusResult,
  "winningCandidateId" | "winningProviderId" | "supportingProviderIds" | "mergedOutput"
>;

function byId(
  candidates: readonly ConsensusCandidate[],
  id: string
): ConsensusCandidate | undefined {
  return candidates.find((c) => c.candidateId === id);
}

function pickByRank(
  candidates: readonly ConsensusCandidate[],
  comparison: ComparisonReport,
  prefer: (c: ConsensusCandidate, score: number) => number
): ConsensusCandidate {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const comp = comparison.comparisons.find((x) => x.candidateId === c.candidateId);
    const score = prefer(c, comp?.overallScore ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

abstract class BaseStrategy implements IConsensusStrategy {
  abstract readonly kind: ConsensusStrategyKind;

  constructor(protected readonly merger: IMergeEngine) {}

  abstract decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision>;

  protected finish(
    winner: ConsensusCandidate,
    supporting: readonly ConsensusCandidate[],
    mergeMode: MergeMode
  ): Result<Decision> {
    const merged = this.merger.merge(winner, supporting, mergeMode);
    if (!merged.ok) return merged;
    return success({
      winningCandidateId: winner.candidateId,
      winningProviderId: winner.providerId,
      supportingProviderIds: supporting.map((s) => s.providerId),
      mergedOutput: merged.value,
    });
  }
}

export class SingleWinnerStrategy extends BaseStrategy {
  readonly kind = "single_winner" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const winner = byId(candidates, comparison.winnerCandidateId) ?? candidates[0];
    return this.finish(winner, [], mergeMode === "none" ? "none" : "none");
  }
}

export class HighestConfidenceStrategy extends BaseStrategy {
  readonly kind = "highest_confidence" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const winner = pickByRank(candidates, comparison, (c, overall) => {
      const conf = c.confidence?.confidenceScore ?? overall;
      return conf;
    });
    return this.finish(winner, [], mergeMode);
  }
}

export class BestQualityStrategy extends BaseStrategy {
  readonly kind = "best_quality" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const winner = pickByRank(candidates, comparison, (c, _overall) => {
      const comp = comparison.comparisons.find((x) => x.candidateId === c.candidateId);
      const qualityDim = comp?.dimensions.find((d) => d.dimension === "quality");
      return qualityDim?.score ?? c.observability?.qualityScore ?? 0;
    });
    return this.finish(winner, [], mergeMode);
  }
}

export class LowestCostStrategy extends BaseStrategy {
  readonly kind = "lowest_cost" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const winner = pickByRank(candidates, comparison, (c) => {
      const cost = c.observability?.cost ?? 1;
      return 1 / (cost + 0.0001);
    });
    return this.finish(winner, [], mergeMode);
  }
}

export class LowestLatencyStrategy extends BaseStrategy {
  readonly kind = "lowest_latency" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const winner = pickByRank(candidates, comparison, (c) => {
      const latency = c.observability?.latencyMs ?? c.execution.statistics.totalMs ?? 9999;
      return 1 / (latency + 1);
    });
    return this.finish(winner, [], mergeMode);
  }
}

export class WeightedVotingStrategy extends BaseStrategy {
  readonly kind = "weighted_voting" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const tallies = new Map<string, number>();
    for (const c of candidates) {
      const comp = comparison.comparisons.find((x) => x.candidateId === c.candidateId);
      const weight = (c.weight ?? 1) * (comp?.overallScore ?? 0.5);
      tallies.set(c.candidateId, (tallies.get(c.candidateId) ?? 0) + weight);
    }
    const sorted = [...tallies.entries()].sort((a, b) => b[1] - a[1]);
    const winner = byId(candidates, sorted[0][0])!;
    const supporting = candidates.filter((c) => c.candidateId !== winner.candidateId).slice(0, 2);
    return this.finish(winner, supporting, mergeMode);
  }
}

export class MajorityVoteStrategy extends BaseStrategy {
  readonly kind = "majority_vote" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    // Majority by providerId of top-half rankings
    const topHalf = comparison.comparisons.slice(0, Math.ceil(comparison.comparisons.length / 2));
    const votes = new Map<string, number>();
    for (const c of topHalf) {
      votes.set(c.providerId, (votes.get(c.providerId) ?? 0) + 1);
    }
    const winnerProvider = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const winner =
      candidates.find((c) => c.providerId === winnerProvider) ??
      byId(candidates, comparison.winnerCandidateId)!;
    return this.finish(winner, [], mergeMode);
  }
}

export class ResearchWritingStrategy extends BaseStrategy {
  readonly kind = "research_writing" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const research =
      candidates.find((c) => c.role === "research") ??
      byId(candidates, comparison.comparisons[0]?.candidateId ?? "");
    const writing =
      candidates.find((c) => c.role === "writing") ??
      byId(candidates, comparison.comparisons[1]?.candidateId ?? "") ??
      research;
    const reviewer = candidates.find((c) => c.role === "reviewer");
    const verifier = candidates.find((c) => c.role === "verifier");

    if (!writing) return failure(new ValidationError("writing candidate required"));

    const supporting = [research, reviewer, verifier].filter(
      (c): c is ConsensusCandidate => Boolean(c) && c.candidateId !== writing.candidateId
    );
    return this.finish(writing, supporting, mergeMode === "none" ? "reasoning" : mergeMode);
  }
}

export class ReviewerPatternStrategy extends BaseStrategy {
  readonly kind = "reviewer_pattern" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const primary =
      candidates.find((c) => c.role === "primary" || c.role === "writing") ??
      byId(candidates, comparison.winnerCandidateId)!;
    const reviewers = candidates.filter((c) => c.role === "reviewer");
    return this.finish(primary, reviewers, mergeMode === "none" ? "paragraphs" : mergeMode);
  }
}

export class CommitteePatternStrategy extends BaseStrategy {
  readonly kind = "committee_pattern" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const members = candidates.filter(
      (c) => c.role === "committee_member" || !c.role
    );
    const pool = members.length > 0 ? members : candidates;
    const winner = byId(pool, comparison.winnerCandidateId) ?? pool[0];
    const supporting = pool.filter((c) => c.candidateId !== winner.candidateId);
    return this.finish(winner, supporting, mergeMode === "none" ? "summaries" : mergeMode);
  }
}

export class HierarchicalConsensusStrategy extends BaseStrategy {
  readonly kind = "hierarchical" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    const order: Array<ConsensusCandidate["role"]> = [
      "verifier",
      "reviewer",
      "writing",
      "research",
      "primary",
    ];
    for (const role of order) {
      const found = candidates.find((c) => c.role === role && c.execution.success);
      if (found) {
        const supporting = candidates.filter((c) => c.candidateId !== found.candidateId);
        return this.finish(found, supporting.slice(0, 2), mergeMode);
      }
    }
    const winner = byId(candidates, comparison.winnerCandidateId)!;
    return this.finish(winner, [], mergeMode);
  }
}

export class HybridConsensusStrategy extends BaseStrategy {
  readonly kind = "hybrid" as const;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Decision> {
    // Mix quality ranking with weighted supporting contributors
    const winner = byId(candidates, comparison.winnerCandidateId)!;
    const supporting = comparison.comparisons
      .slice(1, 3)
      .map((c) => byId(candidates, c.candidateId))
      .filter((c): c is ConsensusCandidate => Boolean(c));
    return this.finish(winner, supporting, mergeMode === "none" ? "paragraphs" : mergeMode);
  }
}

export function createStrategyRegistry(
  merger: IMergeEngine
): ReadonlyMap<ConsensusStrategyKind, IConsensusStrategy> {
  const strategies: IConsensusStrategy[] = [
    new SingleWinnerStrategy(merger),
    new HighestConfidenceStrategy(merger),
    new BestQualityStrategy(merger),
    new LowestCostStrategy(merger),
    new LowestLatencyStrategy(merger),
    new WeightedVotingStrategy(merger),
    new MajorityVoteStrategy(merger),
    new ResearchWritingStrategy(merger),
    new ReviewerPatternStrategy(merger),
    new CommitteePatternStrategy(merger),
    new HierarchicalConsensusStrategy(merger),
    new HybridConsensusStrategy(merger),
  ];
  return new Map(strategies.map((s) => [s.kind, s]));
}
