/**
 * Validate a ResolvedGenerationContext (M2B).
 * Does not validate creative output (M4).
 */

import type { ResolvedGenerationContext } from "./types";

export type ContextValidationIssue = {
  code: string;
  message: string;
};

export function validateResolvedGenerationContext(
  ctx: ResolvedGenerationContext,
): ContextValidationIssue[] {
  const issues: ContextValidationIssue[] = [];

  if (!ctx.sessionId) {
    issues.push({ code: "MISSING_SESSION", message: "sessionId required" });
  }
  if (!ctx.serviceId) {
    issues.push({ code: "MISSING_SERVICE", message: "serviceId required" });
  }
  if (!ctx.phaseId) {
    issues.push({ code: "MISSING_PHASE", message: "phaseId required" });
  }
  if (!ctx.contextHash) {
    issues.push({ code: "MISSING_HASH", message: "contextHash required" });
  }
  if (ctx.phaseContext.implementationStatus !== "active") {
    issues.push({
      code: "PHASE_INACTIVE",
      message: `Phase ${ctx.phaseId} is ${ctx.phaseContext.implementationStatus}`,
    });
  }
  if (
    ctx.phaseContext.generationModality === "image" &&
    ctx.phaseContext.uxType === "deck"
  ) {
    // Guard: deck must not be treated as image-required via UX conflation
    issues.push({
      code: "MODALITY_UX_CONFLATION",
      message: "deck uxType must not imply image modality",
    });
  }

  for (const c of ctx.unresolvedConflicts) {
    if (c.blocksGeneration && ctx.status === "ready") {
      issues.push({
        code: "BLOCKING_CONFLICT_READY",
        message: `Blocking conflict ${c.key} but status is ready`,
      });
    }
  }

  // Selections must be semantic selection only
  for (const s of ctx.selections) {
    if (s.semantic !== "selection") {
      issues.push({
        code: "INVALID_SELECTION_SEMANTIC",
        message: "selection must have semantic=selection",
      });
    }
  }
  for (const d of ctx.approvedDecisions) {
    if (d.semantic !== "approval") {
      issues.push({
        code: "INVALID_DECISION_SEMANTIC",
        message: "decision must have semantic=approval",
      });
    }
  }

  return issues;
}

export function toContextSnapshot(
  ctx: ResolvedGenerationContext,
): import("./types").ResolvedGenerationContextSnapshot {
  return {
    contextId: ctx.contextId,
    contextHash: ctx.contextHash,
    status: ctx.status,
    contextSource: ctx.contextSource,
    sessionId: ctx.sessionId,
    serviceId: ctx.serviceId,
    phaseId: ctx.phaseId,
    sessionVersion: ctx.sessionVersion,
    activeBriefId: ctx.activeBriefId,
    activeBriefVersion: ctx.activeBriefVersion,
    requirementKeys: ctx.activeRequirements.map((r) => r.key).sort(),
    selectionPhaseIds: ctx.selections.map((s) => s.phaseId).sort(),
    decisionPhaseIds: ctx.approvedDecisions.map((d) => d.phaseId).sort(),
    upstreamPhaseIds: [
      ...new Set([
        ...ctx.upstreamInputs.map((u) => u.phaseId),
        ...ctx.upstreamOutputs.map((u) => u.phaseId),
      ]),
    ].sort(),
    unresolvedConflictKeys: ctx.unresolvedConflicts.map((c) => c.key).sort(),
  };
}
