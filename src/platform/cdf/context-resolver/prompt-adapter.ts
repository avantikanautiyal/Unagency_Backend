/**
 * Format ResolvedGenerationContext for prompt builders.
 * Authoritative requirements are never dropped for size; supporting raw may be limited.
 */

import type { ResolvedGenerationContext } from "./types";
import { toContextSnapshot } from "./validate";

const SUPPORTING_RAW_MAX = 8_000;

export function formatResolvedContextForPrompt(
  ctx: ResolvedGenerationContext,
): string {
  const lines: string[] = [
    "[CDF Resolved Generation Context — authoritative]",
    `contextId: ${ctx.contextId}`,
    `contextHash: ${ctx.contextHash}`,
    `status: ${ctx.status}`,
    `contextSource: ${ctx.contextSource}`,
    `service: ${ctx.serviceId}`,
    `phase: ${ctx.phaseId}`,
    `phaseName: ${ctx.phaseContext.name}`,
    `modality: ${ctx.phaseContext.generationModality}`,
    `uxType: ${ctx.phaseContext.uxType}`,
    `executionStrategy: ${ctx.phaseContext.executionStrategy}`,
    `allowNonVisualReady: ${ctx.phaseContext.allowNonVisualReady}`,
    `artifactKey: ${ctx.phaseContext.artifactKey}`,
  ];

  if (ctx.phaseContext.entryMessage?.trim()) {
    lines.push(`phasePurpose: ${ctx.phaseContext.entryMessage.trim()}`);
  }
  if (ctx.phaseContext.description?.trim()) {
    lines.push(`phaseDescription: ${ctx.phaseContext.description.trim()}`);
  }
  if (ctx.phaseContext.choiceNoun) {
    lines.push(`choiceNoun: ${ctx.phaseContext.choiceNoun}`);
  }
  if (ctx.phaseContext.textLines?.length) {
    lines.push("textLines:");
    for (const line of ctx.phaseContext.textLines) {
      lines.push(`- ${line}`);
    }
  }

  if (ctx.currentUserInstruction) {
    lines.push("Current user instruction:");
    lines.push(ctx.currentUserInstruction);
  }

  if (ctx.activeRequirements.length) {
    lines.push("Authoritative requirements:");
    for (const r of ctx.activeRequirements) {
      lines.push(
        `- ${r.key}: ${r.displayValue} [${r.priority}] (req:${r.requirementId})`,
      );
    }
  }

  if (ctx.exclusions.length) {
    lines.push("Exclusions:");
    for (const e of ctx.exclusions) {
      lines.push(`- ${e.key}: ${e.displayValue}`);
    }
  }

  if (ctx.selections.length) {
    lines.push("Selections (authoritative — not approvals):");
    for (const s of ctx.selections) {
      lines.push(`- ${s.phaseId}: ${s.label}`);
    }
  }

  if (ctx.approvedDecisions.length) {
    lines.push("Approved decisions:");
    for (const d of ctx.approvedDecisions) {
      lines.push(
        `- ${d.phaseId}: ${d.label}${d.note ? ` — ${d.note.slice(0, 500)}` : ""}`,
      );
    }
  }

  if (ctx.upstreamOutputs.length || ctx.upstreamInputs.length) {
    lines.push("Upstream dependencies:");
    for (const u of [...ctx.upstreamInputs, ...ctx.upstreamOutputs]) {
      lines.push(
        `- ${u.phaseId} (${u.source}${u.referenceId ? `:${u.referenceId}` : ""})`,
      );
    }
  }

  if (ctx.refinement) {
    lines.push("Refinement:");
    lines.push(ctx.refinement.prompt);
    if (ctx.refinement.target) {
      lines.push(`target: ${ctx.refinement.target}`);
    } else if (ctx.refinement.ambiguous) {
      lines.push("target: unresolved (do not invent)");
    }
  }

  if (ctx.unresolvedConflicts.length) {
    lines.push("Unresolved conflicts:");
    for (const c of ctx.unresolvedConflicts) {
      lines.push(`- ${c.key}: ${c.reason} (blocks=${c.blocksGeneration})`);
    }
  }

  // Supporting: do not dump every raw message — brief.raw already in requirements
  const briefRaw = ctx.activeRequirements.find((r) => r.key === "brief.raw");
  if (briefRaw && briefRaw.displayValue.length > SUPPORTING_RAW_MAX) {
    lines.push(
      `(brief.raw length ${briefRaw.displayValue.length} — full text retained in requirement store; structured keys above are authoritative)`,
    );
  }

  return lines.join("\n");
}

/** Metadata stamps for Direct / execution create (no secrets). */
export function contextProvenanceMetadata(
  ctx: ResolvedGenerationContext,
): Record<string, unknown> {
  const snap = toContextSnapshot(ctx);
  return {
    cdfContextId: snap.contextId,
    cdfContextHash: snap.contextHash,
    cdfContextStatus: snap.status,
    cdfContextSource: snap.contextSource,
    cdfActiveBriefId: snap.activeBriefId,
    cdfActiveBriefVersion: snap.activeBriefVersion,
    cdfSessionVersion: snap.sessionVersion,
    cdfPhaseId: snap.phaseId,
    cdfServiceId: snap.serviceId,
    cdfGenerationModality: ctx.phaseContext.generationModality,
    cdfUxType: ctx.phaseContext.uxType,
    cdfAllowNonVisualReady: ctx.phaseContext.allowNonVisualReady,
    cdfExecutionStrategy: ctx.phaseContext.executionStrategy,
    cdfArtifactKey: ctx.phaseContext.artifactKey,
    cdfPhaseName: ctx.phaseContext.name,
    cdfSemanticObjective: ctx.phaseContext.entryMessage,
  };
}
