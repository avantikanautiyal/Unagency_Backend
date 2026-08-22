/**
 * Canonical OS execution model — evolvable toward multi-task workflows.
 * Phase 0: fields that aren't wired remain optional / null; do not invent data.
 */

import type { OsLifecycleState } from "../lifecycle/states";
import type { GovernanceDecision } from "../governance/types";

export interface CanonicalExecutionIdentity {
  readonly executionId: string;
  readonly requestId: string;
  readonly organizationId: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly correlationId?: string;
}

export interface CanonicalExecutionRequest {
  readonly prompt: string;
  readonly capabilityId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly idempotencyKey?: string;
}

export interface CanonicalProviderDecision {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly capabilityId?: string;
  readonly routingSource?: "model_intelligence" | "modality_router" | "preferred_metadata" | "unknown";
}

/**
 * Stable internal execution object for the production OS spine.
 * Compatible with existing ExecutionResource; extends for future multi-task fields.
 */
export interface CanonicalOsExecution {
  readonly identity: CanonicalExecutionIdentity;
  readonly request: CanonicalExecutionRequest;
  readonly lifecycle: OsLifecycleState;
  readonly brief?: unknown;
  readonly intent?: string;
  readonly executionPlan?: unknown;
  readonly workflow?: unknown;
  readonly tasks?: readonly unknown[];
  readonly dependencies?: readonly unknown[];
  readonly contextRefs?: Readonly<Record<string, string>>;
  readonly providerDecision?: CanonicalProviderDecision;
  readonly outputs?: unknown;
  readonly evaluation?: {
    readonly score: number | null;
    readonly placeholder: boolean;
    readonly humanReviewRequired: boolean;
  };
  readonly validation?: { readonly status: "not_implemented" | "passed" | "failed" };
  readonly governance?: GovernanceDecision;
  readonly approval?: { readonly status: string };
  readonly delivery?: { readonly status: string };
  readonly audit?: { readonly recorded: boolean };
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly category:
      | "validation"
      | "authentication"
      | "authorization"
      | "provider"
      | "timeout"
      | "rate_limit"
      | "model_unavailable"
      | "dependency"
      | "task"
      | "internal";
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createCanonicalOsExecution(input: {
  readonly identity: CanonicalExecutionIdentity;
  readonly request: CanonicalExecutionRequest;
  readonly lifecycle: OsLifecycleState;
  readonly nowIso: string;
}): CanonicalOsExecution {
  return {
    identity: input.identity,
    request: input.request,
    lifecycle: input.lifecycle,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}
