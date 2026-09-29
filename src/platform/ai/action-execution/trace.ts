/**
 * Phase 15 — Safe observability via existing execution-trace (no second system).
 */

import {
  beginExecutionTrace,
  recordExecutionTraceStage,
} from "../../os/observability/execution-trace";
import type { ActionDefinition } from "../action-registry";
import type { ActionExecutionResult } from "./types";

const SENSITIVE_KEY =
  /prompt|secret|token|password|authorization|signedUrl|storagePath|conversationBody|artifactData|rawPrompt/i;

export function emitActionExecutionTraceStart(args: {
  readonly action: ActionDefinition;
  readonly executionId: string;
  readonly correlationId: string;
  readonly requestId?: string;
  readonly dryRun: boolean;
  readonly cdfSessionId?: string;
  readonly cdfPhaseId?: string;
}): void {
  beginExecutionTrace({
    requestId: args.requestId ?? args.executionId,
    executionId: args.executionId,
    correlationId: args.correlationId,
    service: args.action.domain,
  });
  recordExecutionTraceStage({
    executionId: args.executionId,
    stage: "action_execution",
    status: "COMPLETED",
    details: sanitizeDetails({
      actionId: args.action.actionId,
      actionVersion: args.action.version,
      executionMode: args.action.executionMode,
      sideEffectLevel: args.action.sideEffectLevel,
      dryRun: args.dryRun,
      cdfSessionId: args.cdfSessionId,
      cdfPhaseId: args.cdfPhaseId,
      phase: "start",
    }),
  });
}

export function emitActionExecutionTraceResult(
  result: ActionExecutionResult,
): void {
  const executionId = result.executionId;
  if (!executionId) return;
  recordExecutionTraceStage({
    executionId,
    stage: "action_execution",
    status: result.ok ? "COMPLETED" : "FAILED",
    error: result.ok ? undefined : result.code,
    details: sanitizeDetails({
      actionId: result.actionId,
      actionVersion: result.actionVersion,
      executionMode: result.executionMode,
      dryRun: result.dryRun,
      ok: result.ok,
      code: result.ok ? undefined : result.code,
      sideEffectLevel: result.ok ? result.sideEffectLevel : undefined,
      phase: "result",
    }),
  });
}

export function sanitizeDetails(
  details: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (v === undefined) continue;
    if (typeof v === "string" && v.length > 256) {
      out[k] = `[omitted len=${v.length}]`;
      continue;
    }
    if (v && typeof v === "object") continue; // no nested payloads
    out[k] = v;
  }
  return out;
}
