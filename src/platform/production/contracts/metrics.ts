/**
 * Benchmark, certification, failure, and observability contracts.
 */

import type {
  CertificationArea,
  FailureSeverity,
  ValidationCheckStatus,
} from "./enums";

export interface ValidationCheckResult {
  readonly checkId: string;
  readonly area: string;
  readonly status: ValidationCheckStatus;
  readonly message: string;
  readonly observed?: Readonly<Record<string, unknown>>;
  readonly expected?: Readonly<Record<string, unknown>>;
}

export interface BenchmarkResult {
  readonly providerLatencyMs: number;
  readonly executionLatencyMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cost: number;
  readonly retryCount: number;
  readonly streamingChunkCount: number;
  readonly evaluationScore: number;
  readonly humanReviewRequired: boolean;
  readonly capturedAt: string;
}

export interface CertificationVerdict {
  readonly area: CertificationArea;
  readonly passed: boolean;
  readonly score: number;
  readonly notes: readonly string[];
}

export interface ProductionReadinessScore {
  readonly overall: number;
  readonly execution: number;
  readonly provider: number;
  readonly capability: number;
  readonly workflow: number;
  readonly grade: "A" | "B" | "C" | "D" | "F";
  readonly readyForProduction: boolean;
}

export interface FailureAnalysis {
  readonly failed: boolean;
  readonly rootCause?: string;
  readonly stageFailure?: string;
  readonly responsibleModule?: string;
  readonly suggestedFix?: string;
  readonly severity?: FailureSeverity;
  readonly details?: readonly string[];
}

export interface ProductionExecutionTrace {
  readonly correlationId: string;
  readonly requestId: string;
  readonly stageTimings: readonly {
    readonly stage: string;
    readonly durationMs: number;
    readonly status: string;
  }[];
  readonly bridgeTimings: readonly {
    readonly bridgeName: string;
    readonly durationMs: number;
    readonly status: string;
  }[];
  readonly providerTimings: {
    readonly totalMs: number;
    readonly executionMs: number;
    readonly retries: number;
  };
  readonly artifactKeys: readonly string[];
  readonly evaluationSummary?: Readonly<Record<string, unknown>>;
  readonly experienceSummary?: Readonly<Record<string, unknown>>;
  readonly learningSummary?: Readonly<Record<string, unknown>>;
  readonly capturedAt: string;
}
