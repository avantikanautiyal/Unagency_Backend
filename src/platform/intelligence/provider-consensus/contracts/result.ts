/**
 * Consensus result — single canonical execution outcome.
 */

import type { ProviderExecutionResponse } from "../../providers/runtime/contracts/provider-execution-response";
import type { ConsensusResultId } from "./identifiers";
import type { ConsensusStrategyKind, MergeMode } from "./enums";
import type { ComparisonReport } from "./comparison";
import type { ConsensusExplanation } from "./explainability";
import type { ConsensusRequest } from "./request";

export interface ConsensusScore {
  readonly overall: number;
  readonly agreement: number;
  readonly quality: number;
  readonly confidence: number;
}

export interface AlternativeResult {
  readonly candidateId: string;
  readonly providerId: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly score: number;
  readonly reasonNotSelected: string;
}

export interface ConsensusResult {
  readonly resultId: ConsensusResultId;
  readonly requestId: string;
  readonly strategy: ConsensusStrategyKind;
  readonly mergeMode: MergeMode;
  readonly winningProviderId: string;
  readonly winningCandidateId: string;
  readonly supportingProviderIds: readonly string[];
  readonly mergedOutput: Readonly<Record<string, unknown>>;
  readonly canonicalResponse: ProviderExecutionResponse;
  readonly consensusScore: ConsensusScore;
  readonly confidence: number;
  readonly comparison: ComparisonReport;
  readonly explanation: ConsensusExplanation;
  readonly alternativeResults: readonly AlternativeResult[];
  readonly conflictsResolved: number;
  readonly createdAt: string;
}

export interface ConsensusReport {
  readonly resultId: ConsensusResultId;
  readonly request: ConsensusRequest;
  readonly consensus: ConsensusResult;
  readonly candidatesEvaluated: number;
  readonly durationMs: number;
  readonly createdAt: string;
}
