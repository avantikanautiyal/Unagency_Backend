/**
 * Execution API contracts — stable platform surface.
 */

import type { ExecutionApiStatus } from "./enums";

export interface CreateExecutionRequest {
  readonly prompt: string;
  readonly capabilityId?: string;
  /** Routed provider — required for async video when set by routing / client. */
  readonly providerId?: string;
  /** Routed model — required for async video when set by routing / client. */
  readonly modelId?: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly toolNames?: readonly string[];
  readonly structuredOutput?: {
    readonly schema: Readonly<Record<string, unknown>>;
    readonly name?: string;
    readonly strict?: boolean;
  };
  readonly stream?: boolean;
  readonly idempotencyKey?: string;
}

/**
 * Presentation-safe execution result (M10.5).
 * Provider-specific schemas stop at the backend adapter — never raw vendor payloads.
 */
export type ExecutionResultKind =
  | "text"
  | "structured"
  | "pending"
  | "artifact"
  | "tool_approval_required"
  | "empty";

export interface ExecutionResultPayload {
  readonly kind: ExecutionResultKind;
  readonly text?: string;
  readonly data?: unknown;
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
  /** Null/undefined when unknown — never invent 0 (M9.5Q). */
  readonly cost?: number | null;
  readonly evaluationScore?: number;
  readonly errorMessage?: string;
  readonly approvalRequired?: boolean;
  readonly toolInvocationKey?: string;
  /**
   * Safe pending tool approvals for product UX (M10.7).
   * Sanitized — never raw provider/tool secret payloads.
   */
  readonly pendingApprovals?: readonly {
    readonly invocationId: string;
    readonly toolName: string;
    readonly displayName: string;
    readonly description: string;
    readonly riskClass?: string;
    readonly argumentsSummary: Readonly<Record<string, unknown>>;
    readonly requestedAt: string;
  }[];
  /** Presentation-safe result for product UI (M10.5+). */
  readonly result?: ExecutionResultPayload;
  /** Durable ExecutionArtifact ids when media finalize completed (M10.6). */
  readonly artifactIds?: readonly string[];
}

export interface ExecutionArtifactRef {
  readonly artifactId: string;
  readonly kind: string;
  readonly label: string;
  readonly mimeType?: string;
  readonly createdAt?: string;
}

export interface ExecutionDiagnostics {
  readonly executionId: string;
  readonly rootCause?: string;
  readonly stages: readonly { stage: string; status: string; durationMs?: number }[];
  readonly generatedAt: string;
  readonly executionMode?: string;
  readonly providerMode?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly routingDecisionId?: string;
  readonly contextSnapshotId?: string;
  readonly promptCompilationId?: string;
  readonly brandEnrichmentId?: string;
  readonly brandBrainVersion?: number;
  readonly knowledgeSnapshotId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerLatencyMs?: number;
  readonly artifactId?: string;
  readonly evaluationScore?: number;
  readonly contextCompleteness?: Readonly<Record<string, boolean>>;
  readonly providerOperationId?: string;
  readonly providerJobId?: string;
  readonly providerOperationState?: string;
  readonly pollCount?: number;
  readonly submittedAt?: string;
  readonly lastPolledAt?: string;
  readonly nextPollAt?: string;
}

export interface ExecutionTraceSummary {
  readonly executionId: string;
  readonly correlationId: string;
  readonly stages: readonly string[];
  readonly durationMs: number;
}

export interface ExecutionCostSummary {
  readonly executionId: string;
  /** Null when cost unknown — NEVER invent 0 (M9.5Q). */
  readonly amount: number | null;
  readonly currency: string | null;
  readonly status?:
    | "calculated"
    | "partially_calculated"
    | "unknown"
    | "unavailable"
    | "not_applicable";
  readonly knownAmount?: number;
  readonly unknownAttemptCount?: number;
  readonly pricingVersion?: string | null;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface ExecutionEvaluationSummary {
  readonly executionId: string;
  readonly score: number | null;
  readonly humanReviewRequired: boolean;
}

export interface ExecutionExperienceSummary {
  readonly executionId: string;
  readonly experienceIds: readonly string[];
  readonly applied: boolean;
}
