/**
 * Auto-approve pending tool invocations for autonomous AI / Hybrid modes.
 */

import { failure, success, type Result } from "../../intelligence/shared/result";
import { ValidationError } from "../../intelligence/shared/errors";
import type { AuthPrincipal } from "../contracts";
import type { ExecutionResource } from "../contracts";
import {
  approveToolInvocation,
  type ToolRuntimePlatform,
} from "../../intelligence/providers/tools/composition/tool-runtime-platform";

export interface AutoApproveToolsResult {
  readonly status: ExecutionResource["status"];
  readonly approvalRequired: boolean;
  readonly toolInvocationKey?: string;
  readonly errorMessage?: string;
  readonly completedAt?: string;
  readonly jobSummary: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
}

function jobSummaryFromRuntimeOutput(
  runtimeOutput: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  const structuredFromOrch =
    typeof runtimeOutput.structured !== "undefined"
      ? runtimeOutput.structured
      : undefined;
  return {
    ...(structuredFromOrch != null ? { structuredData: structuredFromOrch } : {}),
    ...(typeof runtimeOutput.content === "string"
      ? { resultText: runtimeOutput.content }
      : typeof runtimeOutput.text === "string"
        ? { resultText: runtimeOutput.text }
        : typeof runtimeOutput.message === "string"
          ? { resultText: runtimeOutput.message }
          : {}),
  };
}

export async function autoApprovePendingToolInvocations(input: {
  readonly platform: ToolRuntimePlatform;
  readonly organizationId: string;
  readonly executionId: string;
  readonly principal: AuthPrincipal;
  readonly nowIso: () => string;
  readonly maxRounds?: number;
}): Promise<Result<AutoApproveToolsResult>> {
  const maxRounds = input.maxRounds ?? 8;
  let status: ExecutionResource["status"] = "awaiting_approval";
  let approvalRequired = true;
  let toolInvocationKey: string | undefined;
  let errorMessage: string | undefined;
  let jobSummary: Readonly<Record<string, unknown>> = {};
  let runtimeOutput: Readonly<Record<string, unknown>> | undefined;

  for (let round = 0; round < maxRounds; round += 1) {
    const records = await input.platform.invocationStore.listByExecution(
      input.executionId
    );
    const pending = records.filter((record) => record.status === "awaiting_approval");
    if (pending.length === 0) {
      if (round === 0) {
        return failure(new ValidationError("No pending tool invocations to auto-approve"));
      }
      break;
    }

    const invocationKey = pending[0]!.invocationKey;
    toolInvocationKey = invocationKey;

    const approved = await approveToolInvocation({
      platform: input.platform,
      organizationId: input.organizationId,
      executionId: input.executionId,
      invocationKey,
      principal: input.principal,
      decision: "approve",
      reason: "auto_approved_product_mode",
    });
    if (!approved.ok) {
      return approved;
    }

    const resumed = approved.value.resumed?.providerResult;
    const awaitingMore = resumed?.error?.code === "TOOL_APPROVAL_REQUIRED";
    runtimeOutput = (resumed?.response?.output ?? {}) as Readonly<Record<string, unknown>>;
    jobSummary = jobSummaryFromRuntimeOutput(runtimeOutput);

    if (awaitingMore) {
      status = "awaiting_approval";
      approvalRequired = true;
      errorMessage = resumed?.error?.message;
      continue;
    }

    status = resumed
      ? resumed.success
        ? "succeeded"
        : "failed"
      : "failed";
    approvalRequired = false;
    toolInvocationKey = undefined;
    errorMessage = resumed?.success ? undefined : resumed?.error?.message;
    break;
  }

  if (status === "awaiting_approval") {
    return failure(new ValidationError("Tool auto-approval exceeded maximum rounds"));
  }

  return success({
    status,
    approvalRequired,
    toolInvocationKey,
    errorMessage,
    completedAt: status === "succeeded" || status === "failed" ? input.nowIso() : undefined,
    jobSummary,
    runtimeOutput,
  });
}
