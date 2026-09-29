/**
 * Build RequirementContextSnapshot for prompt builders / M2B input.
 */

import type {
  CdfActiveBrief,
  CdfRequirementContextSnapshot,
  CdfSourceInput,
} from "./types";

export function buildRequirementContextSnapshot(input: {
  brief: CdfActiveBrief;
  sources: CdfSourceInput[];
}): CdfRequirementContextSnapshot {
  const { brief, sources } = input;
  const byId = new Map(sources.map((s) => [s.sourceInputId, s]));

  const rawSourceTexts = brief.sourceInputIds
    .map((id) => byId.get(id))
    .filter((s): s is CdfSourceInput => Boolean(s))
    .filter(
      (s) =>
        s.type === "user_prompt" ||
        s.type === "user_message" ||
        s.type === "refinement",
    )
    .map((s) => ({
      sourceInputId: s.sourceInputId,
      type: s.type,
      rawContent: s.rawContent,
    }));

  const active = brief.activeRequirements;

  return {
    activeBriefId: brief.activeBriefId,
    activeBriefVersion: brief.version,
    sessionId: brief.sessionId,
    serviceId: brief.serviceId,
    rawSourceTexts,
    explicitRequirements: active
      .filter((r) => r.explicit)
      .map((r) => ({
        requirementId: r.requirementId,
        key: r.key,
        displayValue: r.displayValue,
        category: r.category,
        priority: r.priority,
      })),
    constraints: brief.constraints.map((r) => ({
      key: r.key,
      displayValue: r.displayValue,
    })),
    exclusions: brief.exclusions.map((r) => ({
      key: r.key,
      displayValue: r.displayValue,
    })),
    references: brief.references.map((r) => ({
      key: r.key,
      displayValue: r.displayValue,
    })),
    approvedDecisions: brief.decisions.map((r) => ({
      key: r.key,
      displayValue: r.displayValue,
    })),
    selections: active
      .filter((r) => r.key.startsWith("selection."))
      .map((r) => ({ key: r.key, displayValue: r.displayValue })),
    unresolvedConflicts: brief.unresolvedConflicts,
    sourceInputRefs: [...brief.sourceInputIds],
  };
}

/**
 * Format explicit requirements for prompt injection WITHOUT truncating critical keys.
 * Raw brief text is listed fully (callers may still attach session.brief for compat).
 */
export function formatRequirementSnapshotForPrompt(
  snapshot: CdfRequirementContextSnapshot,
): string {
  const lines: string[] = ["[CDF Requirement Context — authoritative]"];

  if (snapshot.rawSourceTexts.length) {
    lines.push("Raw user inputs (full, untruncated):");
    for (const raw of snapshot.rawSourceTexts) {
      lines.push(`--- ${raw.type} (${raw.sourceInputId}) ---`);
      lines.push(raw.rawContent);
    }
  }

  if (snapshot.explicitRequirements.length) {
    lines.push("Explicit requirements:");
    for (const r of snapshot.explicitRequirements) {
      if (r.key === "brief.raw" || r.key.startsWith("brief.message.")) continue;
      lines.push(`- ${r.key}: ${r.displayValue} [${r.priority}]`);
    }
  }

  if (snapshot.exclusions.length) {
    lines.push("Exclusions:");
    for (const e of snapshot.exclusions) {
      lines.push(`- ${e.key}: ${e.displayValue}`);
    }
  }

  if (snapshot.constraints.length) {
    lines.push("Constraints:");
    for (const c of snapshot.constraints) {
      if (c.key === "brief.raw") continue;
      lines.push(`- ${c.key}: ${c.displayValue}`);
    }
  }

  if (snapshot.selections.length) {
    lines.push("Selections (not approvals):");
    for (const s of snapshot.selections) {
      lines.push(`- ${s.key}: ${s.displayValue}`);
    }
  }

  if (snapshot.approvedDecisions.length) {
    lines.push("Approved decisions:");
    for (const d of snapshot.approvedDecisions) {
      lines.push(`- ${d.key}: ${d.displayValue}`);
    }
  }

  if (snapshot.unresolvedConflicts.length) {
    lines.push("Unresolved conflicts (do not guess):");
    for (const c of snapshot.unresolvedConflicts) {
      lines.push(`- ${c.key}: ${c.reason}`);
    }
  }

  return lines.join("\n");
}
