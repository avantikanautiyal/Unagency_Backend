import {
  EvaluationRequestBuilder,
  evaluationIdentityFromIds,
} from "../builders/evaluation-builders";
import type { EvaluationRequest } from "../contracts/evaluation-models";
import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";

export function sampleExecutionResult(
  overrides: Partial<ExecutionResult> = {}
): ExecutionResult {
  return {
    sessionId: "session_eval_1",
    state: "completed",
    success: true,
    message: "Execution completed",
    output: { message: "Hello from UNAGENCY intelligence platform." },
    completedAt: "2026-07-03T10:00:00.000Z",
    ...overrides,
  };
}

export function sampleEvaluationIdentity() {
  return evaluationIdentityFromIds({
    organizationId: "org_1",
    workspaceId: "ws_1",
    executionId: "exec_1",
    userId: "user_1",
    capabilityId: "echo",
    correlationId: "corr_eval_1",
  });
}

export function sampleEvaluationRequest(
  overrides: Partial<EvaluationRequest> = {}
): EvaluationRequest {
  const base = EvaluationRequestBuilder.create()
    .withIdentity(sampleEvaluationIdentity())
    .withExecutionResult(sampleExecutionResult())
    .build();

  return { ...base, ...overrides };
}

export function failingExecutionResult(): ExecutionResult {
  return sampleExecutionResult({
    success: false,
    state: "failed",
    message: "Execution failed",
    output: { message: "unsafe content detected", safetyFlags: ["unsafe"] },
    errorCode: "EXECUTION_FAILED",
  });
}

export function policyViolationExecutionResult(): ExecutionResult {
  return sampleExecutionResult({
    output: {
      message: "Response with policy_violation marker",
      policyFlags: ["policy_violation"],
    },
  });
}
