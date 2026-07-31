/**
 * Build presentation-safe ExecutionResultPayload from job summary / runtime output.
 * M10.5 — never expose vendor bodies, credentials, or signed URLs.
 */

import type {
  ExecutionApiStatus,
  ExecutionResultPayload,
} from "../contracts";

const MAX_TEXT = 8_000;

export function buildExecutionResultPayload(input: {
  readonly status: ExecutionApiStatus;
  readonly jobSummary?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
}): ExecutionResultPayload {
  const { status, jobSummary, runtimeOutput } = input;

  if (status === "awaiting_approval") {
    return { kind: "tool_approval_required" };
  }

  if (
    status === "queued" ||
    status === "running" ||
    status === "waiting_provider" ||
    status === "processing_result" ||
    status === "streaming" ||
    status === "retrying"
  ) {
    return { kind: "pending" };
  }

  const structured =
    jobSummary?.structuredData ??
    runtimeOutput?.structured ??
    runtimeOutput?.structuredOutput ??
    (runtimeOutput?.data != null && typeof runtimeOutput.data === "object"
      ? runtimeOutput.data
      : undefined);

  if (structured != null) {
    return { kind: "structured", data: structured };
  }

  const fromSummary =
    typeof jobSummary?.resultText === "string" ? jobSummary.resultText : undefined;
  const fromRuntime = pickText(runtimeOutput);
  const text = (fromSummary ?? fromRuntime)?.slice(0, MAX_TEXT);

  if (text?.trim()) {
    return { kind: "text", text };
  }

  return { kind: "empty" };
}

function pickText(
  output: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  if (!output) return undefined;
  for (const key of ["content", "text", "message"] as const) {
    const value = output[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}
