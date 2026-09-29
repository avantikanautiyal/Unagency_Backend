/**
 * Phase 20 — Controlled HTTP create Output QA / Repair seam.
 * Does not replace DirectExecutionEngine. Default OFF.
 */

import type { ActionDefinition } from "../action-registry";
import { resolveAction } from "../action-registry";
import type { ActionExecutionResult } from "../action-execution";
import {
  validateCanonicalActionOutput,
  type CanonicalOutputQAResult,
} from "../output-qa";
import {
  attemptCanonicalRepair,
  type CanonicalRepairResult,
} from "../repair";
import type { CanonicalActionExecutionRequest } from "../action-execution";
import {
  isHttpOutputQaEnabled,
  isHttpRepairEnabled,
  type CanonicalEligibilityDecision,
} from "./eligibility";
import { recordExecutionTraceStage } from "../../os/observability/execution-trace";

export type HttpCreateQaSeamResult = {
  readonly attempted: boolean;
  readonly qa?: CanonicalOutputQAResult;
  readonly repairAttempted: boolean;
  readonly repair?: CanonicalRepairResult;
  readonly mayAdvance: boolean;
  readonly path: "skipped" | "qa_only" | "qa_and_repair";
};

function resolveHttpAction(input: {
  readonly serviceId?: string;
  readonly phaseId?: string;
  readonly actionId?: string;
}): ActionDefinition | undefined {
  if (input.actionId) {
    const r = resolveAction(input.actionId);
    return r.ok ? r.action : undefined;
  }
  if (input.serviceId && input.phaseId) {
    const id = `cdf.phase.${input.serviceId}.${input.phaseId}.generate`;
    const r = resolveAction(id);
    return r.ok ? r.action : undefined;
  }
  return undefined;
}

/**
 * Optional post-persistence QA (+ bounded repair) for HTTP create.
 * No-op when CDF_CANONICAL_HTTP_OUTPUT_QA is OFF.
 */
export async function maybeRunHttpCreateOutputQa(input: {
  readonly executionId: string;
  readonly eligibility: CanonicalEligibilityDecision;
  readonly serviceId?: string;
  readonly phaseId?: string;
  readonly actionId?: string;
  readonly executionResult: ActionExecutionResult;
  readonly executionRequest?: CanonicalActionExecutionRequest;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<HttpCreateQaSeamResult> {
  const env = input.env ?? process.env;
  if (
    isHttpRepairEnabled(env) &&
    !isHttpOutputQaEnabled(env)
  ) {
    // Repair without QA is forbidden — do not invent repair-only path.
    return {
      attempted: false,
      repairAttempted: false,
      mayAdvance: true,
      path: "skipped",
    };
  }

  if (!isHttpOutputQaEnabled(env)) {
    return {
      attempted: false,
      repairAttempted: false,
      mayAdvance: true,
      path: "skipped",
    };
  }

  const action = resolveHttpAction(input);
  if (!action) {
    recordExecutionTraceStage({
      executionId: input.executionId,
      stage: "output_qa",
      status: "SKIPPED",
      skipReason: "http_qa_action_unresolved",
      details: {
        httpQaSeam: true,
        serviceId: input.serviceId,
        phaseId: input.phaseId,
        sensitiveBodiesOmitted: true,
      },
    });
    return {
      attempted: false,
      repairAttempted: false,
      mayAdvance: true,
      path: "skipped",
    };
  }

  const qa = validateCanonicalActionOutput({
    action,
    executionResult: input.executionResult,
    context: {
      expectedServiceId: input.serviceId,
      expectedPhaseId: input.phaseId,
    },
  });

  let repair: CanonicalRepairResult | undefined;
  let repairAttempted = false;

  if (
    isHttpRepairEnabled(env) &&
    input.eligibility.eligible &&
    input.eligibility.generationFlag &&
    qa.status === "INVALID" &&
    input.executionRequest
  ) {
    repairAttempted = true;
    repair = await attemptCanonicalRepair({
      action,
      originalExecutionRequest: input.executionRequest,
      originalExecutionResult: input.executionResult,
      originalQa: qa,
      policy: { enabled: true },
      attemptNumber: 1,
    });
  }

  const finalQa = repair?.finalQa ?? qa;
  const mayAdvance = finalQa.mayAdvance === true;

  recordExecutionTraceStage({
    executionId: input.executionId,
    stage: "output_qa",
    status:
      finalQa.status === "VALID"
        ? "COMPLETED"
        : finalQa.status === "UNSUPPORTED"
          ? "SKIPPED"
          : "FAILED",
    details: {
      httpQaSeam: true,
      status: finalQa.status,
      mayAdvance,
      repairAttempted,
      repairStatus: repair?.status,
      sensitiveBodiesOmitted: true,
    },
  });

  return {
    attempted: true,
    qa: finalQa,
    repairAttempted,
    repair,
    mayAdvance,
    path: repairAttempted ? "qa_and_repair" : "qa_only",
  };
}
