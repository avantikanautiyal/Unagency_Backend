import {
  EvaluationRequestBuilder,
  evaluationIdentityFromIds,
} from "../builders/evaluation-builders";
import type { EvaluationRequest } from "../contracts/evaluation-models";
import type { ExecutionResult } from "../../execution-runtime/contracts/execution-result";
import type { DynamicEvaluationRequest } from "../contracts/dynamic-evaluation";
import {
  createDynamicEvaluationPlatform,
  type CreateDynamicEvaluationOptions,
  type DynamicEvaluationPlatform,
} from "../factories/create-dynamic-evaluation-engine";
import { asCapabilityId } from "../../shared/identifiers";

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

export function deterministicDynamicHelpers() {
  let id = 0;
  let ms = 0;
  return {
    createId: (prefix: string) => `${prefix}_${++id}`,
    nowIso: () => "2026-07-14T00:00:00.000Z",
    clockMs: () => (ms += 3),
  };
}

export function setupDynamicEvaluationPlatform(
  options: CreateDynamicEvaluationOptions = {}
): DynamicEvaluationPlatform {
  const helpers = deterministicDynamicHelpers();
  return createDynamicEvaluationPlatform({
    createId: helpers.createId,
    nowIso: helpers.nowIso,
    clockMs: helpers.clockMs,
    ...options,
  });
}

export function sampleMarketingCarouselDynamicRequest(): DynamicEvaluationRequest {
  return {
    requestId: "dyn_eval_marketing",
    identity: evaluationIdentityFromIds({
      organizationId: "org_1",
      workspaceId: "ws_1",
      executionId: "exec_mkt_1",
      capabilityId: "marketing.social.carousel",
    }),
    inputs: {
      executionResult: sampleExecutionResult({
        output: {
          message: "Instagram carousel campaign with CTA and creative storytelling",
          channel: "instagram",
          format: "carousel",
        },
      }),
      context: {
        capabilityHints: ["marketing.social.carousel"],
        industryHint: "retail",
        departmentHint: "marketing",
        outputTypeHint: "social_carousel",
        riskLevel: "low",
      },
    },
  };
}

export function sampleSoftwareDynamicRequest(): DynamicEvaluationRequest {
  return {
    requestId: "dyn_eval_software",
    identity: evaluationIdentityFromIds({
      organizationId: "org_1",
      workspaceId: "ws_1",
      executionId: "exec_sw_1",
      capabilityId: "software.code_generation",
    }),
    inputs: {
      executionResult: sampleExecutionResult({
        output: {
          message: "React Native app architecture with auth security and performance cache",
          stack: "react-native",
        },
      }),
      context: {
        capabilityHints: ["software.code_generation"],
        industryHint: "technology",
        departmentHint: "software",
        outputTypeHint: "mobile_app",
        riskLevel: "medium",
      },
    },
  };
}

export function sampleMedicalDynamicRequest(): DynamicEvaluationRequest {
  return {
    requestId: "dyn_eval_medical",
    identity: evaluationIdentityFromIds({
      organizationId: "org_1",
      workspaceId: "ws_1",
      executionId: "exec_med_1",
      capabilityId: asCapabilityId("healthcare.report"),
    }),
    inputs: {
      executionResult: sampleExecutionResult({
        output: {
          message: "Clinical medical report with patient diagnosis and compliant notes",
          type: "medical_report",
        },
      }),
      context: {
        industryHint: "healthcare",
        departmentHint: "healthcare",
        outputTypeHint: "medical_report",
        riskLevel: "high",
      },
    },
  };
}
