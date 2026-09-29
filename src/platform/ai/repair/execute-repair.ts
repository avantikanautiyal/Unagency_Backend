/**
 * Phase 17 — Canonical automatic repair entry.
 * QA → plan → Action Execution (or offline normalize) → QA again.
 * Never calls providers / Model Runtime / artifacts / CDF SM directly.
 */

import { isCdfCanonicalGenerationContextEnabled } from "../../cdf/generation-context/flag";
import { executeCanonicalAction } from "../action-execution";
import type { CanonicalActionExecutionRequest } from "../action-execution";
import {
  validateCanonicalActionOutput,
  type CanonicalOutputQAResult,
} from "../output-qa";
import { mergeRepairPolicy, planCanonicalRepair } from "./eligibility";
import { attemptDeterministicNormalization } from "./normalize";
import { emitRepairTrace } from "./trace";
import type {
  CanonicalRepairAttemptRecord,
  CanonicalRepairRequest,
  CanonicalRepairResult,
} from "./types";
import { AUTOMATIC_REPAIR_CONTRACT_VERSION } from "./types";

function baseMeta(extra: Record<string, unknown> = {}) {
  return {
    repairContractVersion: AUTOMATIC_REPAIR_CONTRACT_VERSION,
    calledProviderDirectly: false,
    calledModelRuntimeDirectly: false,
    retrievedArtifactsDirectly: false,
    resolvedReferencesDirectly: false,
    retrievedConversationDirectly: false,
    mutatedCmrDirectly: false,
    advancedCdfState: false,
    changedApproval: false,
    changedSelection: false,
    convertedUnsupportedToValid: false,
    infiniteLoop: false,
    ...extra,
  };
}

function finish(result: CanonicalRepairResult): CanonicalRepairResult {
  emitRepairTrace(result);
  return result;
}

/**
 * Attempt bounded automatic repair after an INVALID Output QA result.
 * Default: disabled (policy.enabled=false and/or env OFF).
 */
export async function attemptCanonicalRepair(
  request: CanonicalRepairRequest,
): Promise<CanonicalRepairResult> {
  const policy = mergeRepairPolicy(request.policy);
  const attempt = request.attemptNumber ?? 1;
  const action = request.action;
  const originalQa = request.originalQa;
  const originalExecutionId = request.originalExecutionResult.executionId;

  const plan = planCanonicalRepair({
    action,
    qa: originalQa,
    policy,
    attempt,
    hasCandidateData: Boolean(request.candidateData),
  });

  if (!plan.eligible) {
    const status =
      plan.code === "REPAIR_DISABLED"
        ? "DISABLED"
        : plan.code === "REPAIR_ATTEMPTS_EXHAUSTED"
          ? "EXHAUSTED"
          : "NOT_ELIGIBLE";
    return finish({
      ok: false,
      status,
      code: plan.code,
      message: plan.reason,
      actionId: action.actionId,
      actionVersion: action.version,
      originalExecutionId,
      originalQa,
      plan,
      attempts: [],
      finalQa: originalQa,
      metadata: baseMeta({
        autoRepaired: false,
        originalQaPreserved: true,
      }),
    });
  }

  if (attempt > policy.maxAttempts) {
    return finish({
      ok: false,
      status: "EXHAUSTED",
      code: "REPAIR_ATTEMPTS_EXHAUSTED",
      message: "Repair attempts exhausted",
      actionId: action.actionId,
      actionVersion: action.version,
      originalExecutionId,
      originalQa,
      plan: { ...plan, code: "REPAIR_ATTEMPTS_EXHAUSTED", eligible: false },
      attempts: [],
      finalQa: originalQa,
      metadata: baseMeta({ autoRepaired: false }),
    });
  }

  const attempts: CanonicalRepairAttemptRecord[] = [];

  // --- DETERMINISTIC_NORMALIZATION (no Model Runtime) ---
  if (plan.strategy === "DETERMINISTIC_NORMALIZATION") {
    if (!request.candidateData) {
      return finish({
        ok: false,
        status: "FAILED",
        code: "REPAIR_NOT_SUPPORTED",
        message: "Deterministic normalization requires candidateData",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts: [],
        finalQa: originalQa,
        metadata: baseMeta({ autoRepaired: false }),
      });
    }

    const norm = attemptDeterministicNormalization({
      data: request.candidateData,
      artifactKey:
        request.qaContext?.expectedArtifactKey ??
        action.outputContract.artifactKey,
    });

    if (!norm.ok) {
      return finish({
        ok: false,
        status: "FAILED",
        code: norm.code,
        message: norm.message,
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts: [],
        finalQa: originalQa,
        metadata: baseMeta({
          autoRepaired: false,
          modelRuntimeInvoked: false,
        }),
      });
    }

    const qa = validateCanonicalActionOutput({
      action,
      executionResult: request.originalExecutionResult,
      context: {
        ...request.qaContext,
        providedArtifact: {
          artifactId:
            request.qaContext?.expectedArtifactId ??
            request.qaContext?.providedArtifact?.artifactId ??
            "cdfart_repair_normalized",
          version:
            request.qaContext?.expectedArtifactVersion ??
            request.qaContext?.providedArtifact?.version ??
            1,
          artifactKey:
            request.qaContext?.expectedArtifactKey ??
            action.outputContract.artifactKey,
          data: norm.data,
          fromArtifactVersion: true,
          serviceId: request.qaContext?.expectedServiceId,
          phaseId: request.qaContext?.expectedPhaseId,
        },
      },
      policy: request.qaPolicy,
    });

    attempts.push({
      attempt,
      strategy: "DETERMINISTIC_NORMALIZATION",
      repairExecutionId: `${originalExecutionId ?? "exec"}_repair_norm_${attempt}`,
      executionOk: true,
      qaStatus: qa.status,
      qaCodes: qa.diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    });

    if (qa.status === "VALID") {
      return finish({
        ok: true,
        status: "REPAIRED",
        message: "Deterministic normalization repaired output",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts,
        finalExecutionResult: request.originalExecutionResult,
        finalQa: qa,
        normalizedData: norm.data,
        metadata: baseMeta({
          autoRepaired: true,
          modelRuntimeInvoked: false,
          normalizationMethod: norm.method,
          originalQaPreserved: true,
        }),
      });
    }

    return finish({
      ok: false,
      status: "FAILED",
      code: "REPAIR_QA_FAILED",
      message: "Normalized output still failed Output QA",
      actionId: action.actionId,
      actionVersion: action.version,
      originalExecutionId,
      originalQa,
      plan,
      attempts,
      finalQa: qa,
      normalizedData: norm.data,
      metadata: baseMeta({
        autoRepaired: false,
        modelRuntimeInvoked: false,
        originalQaPreserved: true,
      }),
    });
  }

  // --- STRUCTURED_OUTPUT_REPAIR / CONTRACT_REGENERATION via Action Execution ---
  if (
    plan.strategy === "STRUCTURED_OUTPUT_REPAIR" ||
    plan.strategy === "CONTRACT_REGENERATION"
  ) {
    if (
      action.executionMode === "MODEL_GENERATION" &&
      !isCdfCanonicalGenerationContextEnabled()
    ) {
      return finish({
        ok: false,
        status: "FAILED",
        code: "REPAIR_CONTEXT_CONFLICT",
        message:
          "Canonical generation repair requires CDF_CANONICAL_GENERATION_CONTEXT ON",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts: [],
        finalQa: originalQa,
        metadata: baseMeta({ flagOff: true }),
      });
    }

    const repairExecutionId = `${originalExecutionId ?? "exec"}_repair_${attempt}`;
    const repairRequestId = `${request.originalExecutionRequest.requestId ?? repairExecutionId}_r${attempt}`;

    const repairRequest = buildRepairExecutionRequest({
      original: request.originalExecutionRequest,
      actionId: action.actionId,
      actionVersion: action.version,
      repairExecutionId,
      repairRequestId,
      attempt,
      repairInstruction: plan.repairInstruction ?? "",
      originalExecutionId,
      strategy: plan.strategy,
      originalQaCodes: plan.originalQaCodes,
    });

    // Authority conflict guards
    if (
      repairRequest.executionContext.currentInstruction !==
        request.originalExecutionRequest.executionContext.currentInstruction ||
      repairRequest.input.orchestration?.conversationalInstruction !==
        request.originalExecutionRequest.input.orchestration
          ?.conversationalInstruction
    ) {
      return finish({
        ok: false,
        status: "FAILED",
        code: "REPAIR_CONTEXT_CONFLICT",
        message: "Repair must not overwrite user instruction",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts: [],
        finalQa: originalQa,
        metadata: baseMeta({}),
      });
    }

    const exec = await executeCanonicalAction(
      repairRequest,
      request.executionDeps,
    );

    let qa: CanonicalOutputQAResult;
    if (!exec.ok) {
      attempts.push({
        attempt,
        strategy: plan.strategy,
        repairExecutionId,
        executionOk: false,
        qaStatus: "INVALID",
        qaCodes: ["EXECUTION_FAILED"],
      });
      return finish({
        ok: false,
        status: "FAILED",
        code: "REPAIR_EXECUTION_FAILED",
        message: exec.message,
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts,
        finalExecutionResult: exec,
        finalQa: originalQa,
        metadata: baseMeta({
          autoRepaired: false,
          originalQaPreserved: true,
          usedActionExecution: true,
        }),
      });
    }

    qa = validateCanonicalActionOutput({
      action,
      executionResult: exec,
      context: request.qaContext,
      policy: request.qaPolicy,
    });

    attempts.push({
      attempt,
      strategy: plan.strategy,
      repairExecutionId,
      executionOk: true,
      qaStatus: qa.status,
      qaCodes: qa.diagnostics
        .filter((d) => d.severity === "error")
        .map((d) => d.code),
    });

    if (qa.status === "UNSUPPORTED") {
      return finish({
        ok: false,
        status: "FAILED",
        code: "REPAIR_NOT_ELIGIBLE",
        message: "Repair must not convert UNSUPPORTED into VALID",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts,
        finalExecutionResult: exec,
        finalQa: qa,
        metadata: baseMeta({
          convertedUnsupportedToValid: false,
          usedActionExecution: true,
          originalQaPreserved: true,
        }),
      });
    }

    if (qa.status === "VALID") {
      return finish({
        ok: true,
        status: "REPAIRED",
        message: "Repair succeeded and Output QA is VALID",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts,
        finalExecutionResult: exec,
        finalQa: qa,
        metadata: baseMeta({
          autoRepaired: true,
          usedActionExecution: true,
          originalQaPreserved: true,
          repairExecutionId,
        }),
      });
    }

    // Still INVALID — exhausted if at max
    if (attempt >= policy.maxAttempts) {
      return finish({
        ok: false,
        status: "EXHAUSTED",
        code: "REPAIR_ATTEMPTS_EXHAUSTED",
        message: "Repair QA still INVALID; attempts exhausted",
        actionId: action.actionId,
        actionVersion: action.version,
        originalExecutionId,
        originalQa,
        plan,
        attempts,
        finalExecutionResult: exec,
        finalQa: qa,
        metadata: baseMeta({
          autoRepaired: false,
          usedActionExecution: true,
          originalQaPreserved: true,
        }),
      });
    }

    return finish({
      ok: false,
      status: "FAILED",
      code: "REPAIR_QA_FAILED",
      message: "Repair execution completed but Output QA still INVALID",
      actionId: action.actionId,
      actionVersion: action.version,
      originalExecutionId,
      originalQa,
      plan,
      attempts,
      finalExecutionResult: exec,
      finalQa: qa,
      metadata: baseMeta({
        autoRepaired: false,
        usedActionExecution: true,
        originalQaPreserved: true,
      }),
    });
  }

  return finish({
    ok: false,
    status: "FAILED",
    code: "REPAIR_NOT_SUPPORTED",
    message: `Unsupported strategy ${String(plan.strategy)}`,
    actionId: action.actionId,
    actionVersion: action.version,
    originalExecutionId,
    originalQa,
    plan,
    attempts: [],
    finalQa: originalQa,
    metadata: baseMeta({}),
  });
}

function buildRepairExecutionRequest(input: {
  readonly original: CanonicalActionExecutionRequest;
  readonly actionId: string;
  readonly actionVersion: string;
  readonly repairExecutionId: string;
  readonly repairRequestId: string;
  readonly attempt: number;
  readonly repairInstruction: string;
  readonly originalExecutionId?: string;
  readonly strategy: string;
  readonly originalQaCodes: readonly string[];
}): CanonicalActionExecutionRequest {
  const orig = input.original;
  return {
    actionId: input.actionId,
    actionVersion: input.actionVersion,
    requestId: input.repairRequestId,
    correlationId: orig.correlationId ?? input.originalExecutionId,
    executionId: input.repairExecutionId,
    executionMode: orig.executionMode,
    dryRun: false,
    input: {
      ...orig.input,
      orchestration: {
        ...orig.input.orchestration,
        // Preserve user conversational instruction — do not replace.
        conversationalInstruction:
          orig.input.orchestration?.conversationalInstruction ??
          orig.executionContext.currentInstruction,
        prompt: orig.input.orchestration?.prompt,
        metadata: {
          ...(orig.input.orchestration?.metadata ?? {}),
          outputRepairInstruction: input.repairInstruction,
          repairAttempt: input.attempt,
          repairStrategy: input.strategy,
          originalExecutionId: input.originalExecutionId,
          originalQaCodes: input.originalQaCodes,
          // Never promote CTI effectiveInstruction
        },
      },
    },
    executionContext: {
      ...orig.executionContext,
      // Preserve currentInstruction exactly
      currentInstruction: orig.executionContext.currentInstruction,
      upstreamArtifactRef: orig.executionContext.upstreamArtifactRef,
    },
    authorizationContext: { ...orig.authorizationContext },
    metadata: {
      ...(orig.metadata ?? {}),
      outputRepairInstruction: input.repairInstruction,
      repairAttempt: input.attempt,
      repairStrategy: input.strategy,
      originalExecutionId: input.originalExecutionId,
    },
  };
}

export function getAutomaticRepairContractVersion(): string {
  return AUTOMATIC_REPAIR_CONTRACT_VERSION;
}
