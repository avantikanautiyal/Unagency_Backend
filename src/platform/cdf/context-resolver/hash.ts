/**
 * Deterministic context hash (excludes createdAt / volatile fields).
 */

import { fnv1a32 } from "../canonical";
import type { ResolvedGenerationContext } from "./types";

export function computeContextHash(
  semantic: Pick<
    ResolvedGenerationContext,
    | "serviceId"
    | "phaseId"
    | "sessionVersion"
    | "activeBriefId"
    | "activeBriefVersion"
    | "currentUserInstruction"
    | "activeRequirements"
    | "constraints"
    | "exclusions"
    | "approvedDecisions"
    | "selections"
    | "upstreamInputs"
    | "upstreamOutputs"
    | "refinement"
    | "unresolvedConflicts"
    | "phaseContext"
  >,
): string {
  const payload = [
    semantic.serviceId,
    semantic.phaseId,
    String(semantic.sessionVersion),
    semantic.activeBriefId ?? "",
    String(semantic.activeBriefVersion ?? ""),
    semantic.currentUserInstruction ?? "",
    ...semantic.activeRequirements.map(
      (r) => `${r.requirementId}|${r.key}|${r.displayValue}|${r.priority}`,
    ),
    ...semantic.constraints.map((r) => `c:${r.key}:${r.displayValue}`),
    ...semantic.exclusions.map((r) => `x:${r.key}:${r.displayValue}`),
    ...semantic.approvedDecisions.map(
      (d) => `d:${d.phaseId}:${d.label}:${d.executionId ?? ""}`,
    ),
    ...semantic.selections.map(
      (s) => `s:${s.phaseId}:${s.label}:${s.routeIndex ?? ""}`,
    ),
    ...semantic.upstreamInputs.map(
      (u) => `ui:${u.phaseId}:${u.source}:${u.referenceId ?? ""}`,
    ),
    ...semantic.upstreamOutputs.map(
      (u) => `uo:${u.phaseId}:${u.source}:${u.referenceId ?? ""}`,
    ),
    semantic.refinement
      ? `ref:${semantic.refinement.prompt}|${semantic.refinement.scope ?? ""}|${semantic.refinement.target ?? ""}|${semantic.refinement.ambiguous}`
      : "",
    ...semantic.unresolvedConflicts.map(
      (c) => `cf:${c.key}:${c.requirementIds.join(",")}`,
    ),
    `mod:${semantic.phaseContext.generationModality}`,
    `ux:${semantic.phaseContext.uxType}`,
    `deps:${semantic.phaseContext.dependencyPhaseIds.join(">")}`,
  ].join("\n");

  return `ctx:${fnv1a32(payload)}`;
}

export function createContextId(sessionId: string, phaseId: string, hash: string): string {
  return `ctx_${sessionId.slice(-8)}_${phaseId}_${hash.slice(-8)}`;
}
