/**
 * Durable provider operation — persisted async submission/poll state.
 */

import type { ProviderOperationState } from "./provider-operation-state";

export interface ProviderOperationMediaOutput {
  readonly index: number;
  readonly type: "image" | "audio" | "video" | "text" | "structured" | "other";
  readonly mimeType?: string;
  readonly temporaryUrl?: string;
  readonly base64?: string;
  readonly storageRef?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderOperationRecord {
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly submissionKey: string;
  readonly state: ProviderOperationState;
  readonly providerJobId?: string;
  readonly idempotencyKey: string;
  readonly submittedAt?: string;
  readonly lastPolledAt?: string;
  readonly nextPollAt?: string;
  readonly pollCount: number;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
  readonly terminalAt?: string;
  readonly outputs?: readonly ProviderOperationMediaOutput[];
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly safeMetadata?: Readonly<Record<string, unknown>>;
  readonly artifactIds?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderAsyncSubmitResult {
  readonly providerJobId: string;
  readonly status: "pending" | "completed";
  readonly safeMetadata?: Readonly<Record<string, unknown>>;
  /** When status is completed synchronously (fake provider immediate mode). */
  readonly outputs?: readonly ProviderOperationMediaOutput[];
  readonly usage?: Readonly<Record<string, unknown>>;
}

export interface ProviderAsyncPollResult {
  readonly status: "pending" | "completed" | "failed" | "cancelled";
  readonly nextPollAfterMs?: number;
  readonly outputs?: readonly ProviderOperationMediaOutput[];
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly safeMetadata?: Readonly<Record<string, unknown>>;
}
