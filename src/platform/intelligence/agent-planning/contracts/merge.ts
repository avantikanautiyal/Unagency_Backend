/**
 * Merge strategy contracts.
 */

import type { AgentId } from "./identifiers";
import type { MergeStrategyKind } from "./enums";

export interface MergeStep {
  readonly stepId: string;
  readonly strategy: MergeStrategyKind;
  readonly contributorAgentIds: readonly AgentId[];
  readonly outputArtifactKind: string;
  readonly rationale: string;
}

export interface MergePlan {
  readonly planId: string;
  readonly primaryStrategy: MergeStrategyKind;
  readonly steps: readonly MergeStep[];
  readonly humanMergeRequired: boolean;
  readonly rationale: string;
}
