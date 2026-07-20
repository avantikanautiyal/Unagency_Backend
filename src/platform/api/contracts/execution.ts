/**
 * Execution API contracts — stable platform surface.
 */

import type { ExecutionApiStatus } from "./enums";

export interface CreateExecutionRequest {
  readonly prompt: string;
  readonly capabilityId?: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly stream?: boolean;
}

export interface ExecutionResource {
  readonly executionId: string;
  readonly status: ExecutionApiStatus;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly capabilityId?: string;
  readonly correlationId: string;
  readonly jobId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly promptPreview: string;
  readonly cost?: number;
  readonly evaluationScore?: number;
  readonly errorMessage?: string;
}

export interface ExecutionArtifactRef {
  readonly artifactId: string;
  readonly kind: string;
  readonly label: string;
}

export interface ExecutionDiagnostics {
  readonly executionId: string;
  readonly rootCause?: string;
  readonly stages: readonly { stage: string; status: string; durationMs?: number }[];
  readonly generatedAt: string;
}

export interface ExecutionTraceSummary {
  readonly executionId: string;
  readonly correlationId: string;
  readonly stages: readonly string[];
  readonly durationMs: number;
}

export interface ExecutionCostSummary {
  readonly executionId: string;
  readonly amount: number;
  readonly currency: string;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface ExecutionEvaluationSummary {
  readonly executionId: string;
  readonly score: number;
  readonly humanReviewRequired: boolean;
}

export interface ExecutionExperienceSummary {
  readonly executionId: string;
  readonly experienceIds: readonly string[];
  readonly applied: boolean;
}
