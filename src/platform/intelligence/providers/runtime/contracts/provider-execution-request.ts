/**
 * Provider execution request contract.
 *
 * Purpose: Immutable, provider-independent execution request.
 * Responsibilities: Carry tenant scope, capability/provider selection, payload,
 *   and runtime policies (retry, timeout, streaming).
 * Usage: Produced from an ExecutionPlan by callers; consumed by IProviderRuntime.
 * Future Extension: Tool-call payloads, multi-modal inputs.
 */

import type {
  CapabilityId,
  ExecutionId,
  OrganizationId,
  ProviderId,
  WorkspaceId,
} from "../../../shared/identifiers";
import type { RetryPolicy } from "./retry-policy";
import type { TimeoutPolicy } from "./timeout-policy";

/**
 * Tenant and correlation scope for a provider execution.
 */
export interface ProviderExecutionContext {
  readonly executionId: ExecutionId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly providerId: ProviderId;
  readonly planId?: string;
  readonly correlationId?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable provider execution request.
 * The payload is provider-independent (e.g. a compiled-prompt projection).
 */
export interface ProviderExecutionRequest {
  readonly requestId: string;
  readonly context: ProviderExecutionContext;
  readonly capabilityId: CapabilityId;
  readonly providerId: ProviderId;
  readonly modelId?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly retryPolicy: RetryPolicy;
  readonly timeoutPolicy: TimeoutPolicy;
  readonly streaming: boolean;
  /** Scheduling priority; higher runs first. Defaults to 0. */
  readonly priority: number;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
