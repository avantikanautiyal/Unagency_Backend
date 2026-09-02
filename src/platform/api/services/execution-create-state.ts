/**
 * Mutable state threaded through create-execution phases (direct provider path).
 */

import type { AuthPrincipal, CreateExecutionRequest, ExecutionResource } from "../contracts";
import type { CanonicalExecutionSpecification } from "../../collaboration/conversational-task-intelligence/execution-specification";
import type { ExecutionSpecSnapshot } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";

export type CreatePipelineState = {
  req: CreateExecutionRequest;
  principal: AuthPrincipal;
  capabilityIdRaw: string;
  prompt: string;
  trustedOrganizationId: string;
  workingMetadata?: Record<string, unknown>;
  /** P4.6.1 — immutable spec snapshot frozen at create time. */
  executionSpecSnapshot?: ExecutionSpecSnapshot;
  executionSpec?: CanonicalExecutionSpecification;
  providerPrompt: string;
  requestFingerprint: string;
  executionId: string;
  correlationId: string;
  now: string;
};

export type PhaseOutcome<T> =
  | { kind: "done"; resource: ExecutionResource }
  | { kind: "continue"; state: T };
