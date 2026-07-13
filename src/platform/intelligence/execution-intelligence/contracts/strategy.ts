/**
 * Execution strategy contracts.
 */

import type {
  ExecutionModeKind,
  ExecutionStrategyKind,
  HeuristicKind,
} from "./enums";

export interface ExecutionMode {
  readonly kind: ExecutionModeKind;
  readonly label: string;
  readonly description: string;
  readonly qualityBias: number;
  readonly latencyBias: number;
  readonly costBias: number;
}

export interface ExecutionStrategy {
  readonly kind: ExecutionStrategyKind;
  readonly label: string;
  readonly description: string;
  readonly passes: number;
  readonly requiresReasoning: boolean;
  readonly requiresVerification: boolean;
  readonly supportsParallelism: boolean;
  readonly placeholder?: boolean;
}

export interface ExecutionHeuristic {
  readonly kind: HeuristicKind;
  readonly score: number;
  readonly weight: number;
  readonly rationale: string;
}
