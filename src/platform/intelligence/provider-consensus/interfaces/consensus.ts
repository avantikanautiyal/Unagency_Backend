/**
 * Consensus engine and strategy interfaces.
 */

import type { Result } from "../../shared/result";
import type { ConsensusRequest } from "../contracts/request";
import type { ConsensusReport, ConsensusResult } from "../contracts/result";
import type { ConsensusCandidate } from "../contracts/candidate";
import type { ComparisonReport } from "../contracts/comparison";
import type { ConsensusStrategyKind, MergeMode } from "../contracts/enums";

export interface IProviderConsensusEngine {
  decide(request: ConsensusRequest): Promise<Result<ConsensusReport>>;
}

export interface IConsensusStrategy {
  readonly kind: ConsensusStrategyKind;
  decide(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport,
    mergeMode: MergeMode
  ): Result<Pick<ConsensusResult, "winningCandidateId" | "winningProviderId" | "supportingProviderIds" | "mergedOutput">>;
}

export interface IComparisonEngine {
  compare(candidates: readonly ConsensusCandidate[]): Result<ComparisonReport>;
}

export interface IMergeEngine {
  merge(
    primary: ConsensusCandidate,
    supporting: readonly ConsensusCandidate[],
    mode: MergeMode
  ): Result<Readonly<Record<string, unknown>>>;
}

export interface IConsensusConfidenceEngine {
  score(
    winner: ConsensusCandidate,
    supporting: readonly ConsensusCandidate[],
    comparison: ComparisonReport
  ): Result<{ confidence: number; agreement: number; quality: number }>;
}

export interface IConflictArbitration {
  arbitrate(
    candidates: readonly ConsensusCandidate[],
    comparison: ComparisonReport
  ): Result<{ discarded: readonly string[]; conflictsResolved: number }>;
}

/** Future consumer — interfaces only. */
export interface IExecutionIntelligenceConsensusBridge {
  requireConsensus(requestId: string): Promise<Result<boolean>>;
  requireSingleProvider(requestId: string): Promise<Result<boolean>>;
}
