/**
 * Phase 16 — Safe Output QA observability (existing execution-trace).
 */

import { recordExecutionTraceStage } from "../../os/observability/execution-trace";
import type { CanonicalOutputQAResult } from "./types";

const SENSITIVE =
  /prompt|secret|token|password|authorization|signedUrl|storagePath|conversationBody|artifactData|rawPrompt|contentText/i;

export function emitOutputQATrace(result: CanonicalOutputQAResult): void {
  const executionId = result.executionId;
  if (!executionId) return;
  const details: Record<string, unknown> = {
    actionId: result.actionId,
    actionVersion: result.actionVersion,
    outputKind: result.outputKind,
    status: result.status,
    mayAdvance: result.mayAdvance,
    checkCount: result.checksPerformed.length,
    diagnosticCodes: result.diagnostics.map((d) => d.code),
  };
  if (typeof result.metadata.artifactId === "string") {
    details.artifactId = result.metadata.artifactId;
  }
  if (typeof result.metadata.artifactVersion === "number") {
    details.artifactVersion = result.metadata.artifactVersion;
  }
  if (typeof result.metadata.cdfSessionId === "string") {
    details.cdfSessionId = result.metadata.cdfSessionId;
  }
  if (typeof result.metadata.cdfPhaseId === "string") {
    details.cdfPhaseId = result.metadata.cdfPhaseId;
  }
  for (const k of Object.keys(details)) {
    if (SENSITIVE.test(k)) delete details[k];
  }
  recordExecutionTraceStage({
    executionId,
    stage: "output_qa",
    status:
      result.status === "VALID"
        ? "COMPLETED"
        : result.status === "UNSUPPORTED"
          ? "SKIPPED"
          : "FAILED",
    error:
      result.status === "INVALID"
        ? result.diagnostics[0]?.code
        : result.status === "UNSUPPORTED"
          ? "UNSUPPORTED_VALIDATION"
          : undefined,
    details,
  });
}
