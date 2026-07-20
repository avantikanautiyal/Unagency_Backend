/**
 * Provider Consensus factory.
 */

import { ProviderConsensusEngine } from "../engine/consensus-engine";
import { DefaultComparisonEngine } from "../comparison/comparison-engine";
import { DefaultMergeEngine } from "../aggregation/merge-engine";
import { DefaultConsensusConfidenceEngine } from "../confidence/confidence-engine";
import { DefaultConflictArbitration } from "../conflict-resolution/arbitration";
import type { IProviderConsensusEngine } from "../interfaces/consensus";

export interface ProviderConsensusPlatform {
  readonly engine: IProviderConsensusEngine;
}

export interface CreateProviderConsensusOptions {
  readonly nowIso?: () => string;
  readonly clockMs?: () => number;
  readonly createId?: (prefix: string) => string;
}

export function createProviderConsensusPlatform(
  options: CreateProviderConsensusOptions = {}
): ProviderConsensusPlatform {
  const merger = new DefaultMergeEngine();
  const engine = new ProviderConsensusEngine({
    comparison: new DefaultComparisonEngine(),
    merger,
    confidence: new DefaultConsensusConfidenceEngine(),
    arbitration: new DefaultConflictArbitration(),
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    createId: options.createId,
  });
  return { engine };
}
