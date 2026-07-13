/**
 * Reasoning and decomposition contracts.
 */

export interface ExecutionReasoningPlan {
  readonly enabled: boolean;
  readonly depth: number;
  readonly steps: readonly string[];
  readonly estimatedTokens: number;
  readonly rationale: string;
}

export interface ExecutionDecompositionStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly dependsOn?: readonly string[];
}

export interface ExecutionDecompositionPlan {
  readonly enabled: boolean;
  readonly steps: readonly ExecutionDecompositionStep[];
  readonly parallelism: number;
}
