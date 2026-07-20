/**
 * Consensus request.
 */

import type { ConsensusCandidate } from "./candidate";
import type { ConsensusStrategyKind, MergeMode } from "./enums";

export interface ConsensusRequest {
  readonly requestId: string;
  readonly candidates: readonly ConsensusCandidate[];
  readonly strategy: ConsensusStrategyKind;
  readonly mergeMode?: MergeMode;
  readonly requireMajority?: boolean;
  readonly qualityThreshold?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
