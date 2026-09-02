/**
 * NegotiatedExecution → ProviderExecutionRequest projector.
 *
 * Purpose: Prove the negotiation output is directly runtime-consumable.
 * Responsibilities: Map a NegotiatedExecution + tenant/payload into an
 *   immutable ProviderExecutionRequest (M4.1 contract).
 * Usage: The orchestrator projects the negotiated execution before dispatch.
 * Future Extension: Attach compiled-prompt payloads.
 *
 * This is a pure mapping — it performs NO execution and imports no SDK.
 */

import type {
  ExecutionId,
  OrganizationId,
  WorkspaceId,
} from "../../../core/identifiers";
import type {
  ProviderExecutionContext,
  ProviderExecutionRequest,
} from "../../runtime/contracts/provider-execution-request";
import type { NegotiatedExecution } from "../contracts/negotiated-execution";

export interface ProjectExecutionInput {
  readonly negotiated: NegotiatedExecution;
  readonly executionId: ExecutionId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly planId?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly nowIso?: () => string;
  readonly priorityValue?: number;
}

const PRIORITY_VALUES: Readonly<Record<string, number>> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

export function projectToProviderExecutionRequest(
  input: ProjectExecutionInput
): ProviderExecutionRequest {
  const { negotiated } = input;
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const providerId = negotiated.selectedProviderId;

  const context: ProviderExecutionContext = Object.freeze({
    executionId: input.executionId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    providerId,
    planId: input.planId,
    correlationId: input.correlationId,
  });

  const priority =
    input.priorityValue ??
    PRIORITY_VALUES[negotiated.executionProfile.priority] ??
    0;

  return Object.freeze({
    requestId: input.requestId ?? `preq_${nowIso()}`,
    context,
    capabilityId: negotiated.capabilityId,
    providerId,
    modelId: negotiated.selectedModelId,
    payload: Object.freeze({ ...input.payload }),
    options: input.options ? Object.freeze({ ...input.options }) : undefined,
    retryPolicy: negotiated.executionProfile.retryPolicy,
    timeoutPolicy: negotiated.executionProfile.timeoutPolicy,
    streaming: negotiated.executionProfile.streaming,
    priority,
    createdAt: nowIso(),
    metadata: Object.freeze({
      negotiationId: negotiated.negotiationId,
      confidence: negotiated.confidence,
    }),
  });
}
