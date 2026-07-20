/**
 * Consensus candidate — one provider execution under consideration.
 */

import type { ProviderExecutionResult } from "../../providers/runtime/contracts/provider-execution-response";
import type { EvaluationReport, ConfidenceReport } from "../../evaluation/contracts/evaluation-models";
import type { ConsensusRole } from "./enums";

export interface ProviderObservabilityHints {
  readonly latencyMs?: number;
  readonly cost?: number;
  readonly qualityScore?: number;
  readonly successRate?: number;
  readonly errorRate?: number;
  readonly tokens?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ConsensusCandidate {
  readonly candidateId: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly role?: ConsensusRole;
  readonly weight?: number;
  readonly execution: ProviderExecutionResult;
  readonly evaluation?: EvaluationReport;
  readonly confidence?: ConfidenceReport;
  readonly observability?: ProviderObservabilityHints;
  readonly artifactRefs?: readonly string[];
}
