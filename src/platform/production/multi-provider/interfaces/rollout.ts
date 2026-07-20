/**
 * Multi-Provider Production Rollout interfaces.
 */

import type { Result } from "../../../intelligence/shared/result";
import type {
  BenchmarkExecutionEvidence,
  MultiProviderRolloutReport,
  MultiProviderRolloutRequest,
} from "../contracts";

export interface IMultiProviderRolloutEngine {
  rollout(request: MultiProviderRolloutRequest): Promise<Result<MultiProviderRolloutReport>>;
  listEvidence(): Result<readonly BenchmarkExecutionEvidence[]>;
  getEvidence(evidenceId: string): Result<BenchmarkExecutionEvidence | undefined>;
}

export interface IBenchmarkEvidenceStore {
  add(evidence: BenchmarkExecutionEvidence): void;
  list(): readonly BenchmarkExecutionEvidence[];
  get(evidenceId: string): BenchmarkExecutionEvidence | undefined;
  clear(): void;
}
