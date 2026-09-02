/**
 * Priority 2 — Durable production execution observability contract.
 * Metadata and lifecycle statuses only; no prompts, responses, or secrets.
 */

import type { ExecutionTraceStageRecord } from "./execution-trace";
import type {
  ProductionIntegrityFailureCategory,
  StageOutcomeStatus,
} from "./production-execution-integrity";

export const EXECUTION_OBSERVABILITY_RECORD_KIND =
  "production_execution_observability" as const;

export type ExecutionObservabilityEvidenceStatus = "RECORDED" | "NOT_RECORDED";

export type DurableExecutionObservabilityRecord = {
  readonly recordKind: typeof EXECUTION_OBSERVABILITY_RECORD_KIND;
  readonly executionId: string;
  readonly correlationId: string;
  readonly organizationId: string;
  readonly service: string;
  readonly subtype: string;
  readonly outputKind: string;
  readonly capabilityId?: string;
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;
  readonly selectedProviderId?: string;
  readonly selectedModelId?: string;
  readonly actualProviderId?: string;
  readonly actualModelId?: string;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly classificationStatus: StageOutcomeStatus;
  readonly routingMode?: string;
  readonly adaptiveRoutingEnabled?: boolean;
  readonly routingDecision?: string;
  readonly structuredOutputStatus: StageOutcomeStatus;
  readonly materializationStatus: StageOutcomeStatus;
  readonly artifactPersistenceStatus: StageOutcomeStatus;
  readonly artifactHydrationStatus: StageOutcomeStatus;
  readonly artifactRenderStatus: StageOutcomeStatus;
  readonly runtimeEvaluationStatus: StageOutcomeStatus;
  readonly evaluationPlaneStatus: StageOutcomeStatus;
  readonly evaluationPlaneVersion?: string;
  readonly step2Status: StageOutcomeStatus;
  readonly qualityGateStatus: StageOutcomeStatus;
  readonly evidenceStatus: ExecutionObservabilityEvidenceStatus;
  readonly performanceRecordStatus: StageOutcomeStatus;
  readonly artifactIds: readonly string[];
  readonly artifactType?: string;
  readonly performanceRecordId?: string;
  readonly evidenceSource?: string;
  readonly evidenceMode?: string;
  readonly executionStatus?: string;
  readonly finalOutcome?: string;
  readonly contractValidationStatus?: string;
  readonly qualityScore?: number;
  readonly integrityStatus: "PASS" | "FAIL";
  readonly failureCategory?: ProductionIntegrityFailureCategory;
  readonly failureReason?: string;
  readonly integrityFailures: readonly ProductionIntegrityFailureCategory[];
  readonly stages: readonly ExecutionTraceStageRecord[];
  readonly startedAt: string;
  readonly finalizedAt: string;
  readonly durationMs?: number;
  readonly latencyMs?: number;
  readonly persistedAt: string;
};

export type ExecutionObservabilityQuery = {
  readonly organizationId?: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly requestedProviderId?: string;
  readonly selectedProviderId?: string;
  readonly actualProviderId?: string;
  readonly actualModelId?: string;
  readonly executionStatus?: string;
  readonly integrityStatus?: "PASS" | "FAIL";
  readonly failureCategory?: ProductionIntegrityFailureCategory;
  readonly evidenceStatus?: ExecutionObservabilityEvidenceStatus;
  readonly evaluationPlaneStatus?: StageOutcomeStatus;
  readonly step2Status?: StageOutcomeStatus;
  readonly sinceIso?: string;
  readonly untilIso?: string;
  readonly limit?: number;
};

export type ExecutionObservabilityFinalizeResult = "inserted" | "duplicate" | "unavailable";
