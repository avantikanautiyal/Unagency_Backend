/**
 * Resolve active requirements with priority, overrides, and conflict detection.
 * Deterministic — same inputs → same ActiveBrief resolution.
 */

import {
  createActiveBriefId,
  createConflictId,
  createOverrideId,
} from "./ids";
import type {
  CdfActiveBrief,
  CdfRequirement,
  CdfRequirementOverride,
  CdfRequirementValue,
  CdfSourceInput,
  CdfUnresolvedConflict,
} from "./types";
import { CDF_REQUIREMENT_PRIORITY_RANK } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function valueEqual(a: CdfRequirementValue, b: CdfRequirementValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function conflictCompatibleKey(key: string): string {
  // tone.premium and tone.credible coexist; primary_background conflicts with itself
  if (key.startsWith("tone.")) return key;
  if (key.startsWith("forbidden.")) return key;
  if (key.startsWith("selection.")) return key;
  if (key.startsWith("approval.")) return key;
  if (key.startsWith("brief.message.")) return key;
  return key;
}

function isOverrideIntent(req: CdfRequirement): boolean {
  return (
    req.priority === "explicit_user_override" ||
    req.provenance.extractionMethod === "user_override"
  );
}

function isAmbiguousStyleOnly(req: CdfRequirement): boolean {
  return req.key.startsWith("tone.") && !isOverrideIntent(req);
}

/**
 * Resolve historical + newly extracted requirements into a versioned ActiveBrief.
 * Does not mutate input arrays in place — returns new requirement records with statuses.
 */
export function resolveActiveRequirements(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  historical: CdfRequirement[];
  incoming: CdfRequirement[];
  sourceInputIds: string[];
  previousBrief?: CdfActiveBrief | null;
}): {
  brief: CdfActiveBrief;
  allRequirements: CdfRequirement[];
  overrides: CdfRequirementOverride[];
} {
  const ts = nowIso();
  const byId = new Map<string, CdfRequirement>();
  for (const r of input.historical) {
    byId.set(r.requirementId, { ...r });
  }

  const overrides: CdfRequirementOverride[] = [
    ...(input.previousBrief?.overrides ?? []),
  ];
  const conflicts: CdfUnresolvedConflict[] = [];

  // Apply incoming in sequence order (stable by createdAt then id)
  const incomingSorted = [...input.incoming].sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.requirementId.localeCompare(b.requirementId)
      : a.createdAt.localeCompare(b.createdAt),
  );

  for (const raw of incomingSorted) {
    const neu = { ...raw, updatedAt: ts };
    const groupKey = conflictCompatibleKey(neu.key);

    // Find active competitors with same conflict key
    const competitors = [...byId.values()].filter(
      (r) =>
        r.status === "active" &&
        conflictCompatibleKey(r.key) === groupKey &&
        r.key === neu.key,
    );

    if (competitors.length === 0) {
      byId.set(neu.requirementId, neu);
      continue;
    }

    // Same value → keep existing (idempotent), drop duplicate incoming
    if (competitors.every((c) => valueEqual(c.value, neu.value))) {
      continue;
    }

    // AI inference never outranks / never supersedes explicit
    if (!neu.explicit || neu.priority === "ai_inference") {
      const hasExplicit = competitors.some((c) => c.explicit);
      if (hasExplicit) {
        // discard inference
        continue;
      }
    }

    // Ambiguous style nudge must NOT supersede color/background requirements
    // (handled by different keys). For same tone key, accumulate if different tones.
    if (isAmbiguousStyleOnly(neu) && neu.key.startsWith("tone.")) {
      byId.set(neu.requirementId, neu);
      continue;
    }

    // Clear override intent on same key → supersede
    if (isOverrideIntent(neu) || neu.explicit) {
      // If incoming is explicit_current and competitor is also explicit without clear override:
      // same key different values → conflict unless override intent detected
      if (
        !isOverrideIntent(neu) &&
        competitors.some(
          (c) =>
            c.explicit &&
            CDF_REQUIREMENT_PRIORITY_RANK[c.priority] <=
              CDF_REQUIREMENT_PRIORITY_RANK.explicit_current_user_instruction,
        )
      ) {
        // Two explicit conflicting values without clear override language
        const conflictId = createConflictId();
        for (const c of competitors) {
          byId.set(c.requirementId, {
            ...c,
            status: "conflicted",
            conflictGroupId: conflictId,
            updatedAt: ts,
          });
        }
        byId.set(neu.requirementId, {
          ...neu,
          status: "conflicted",
          conflictGroupId: conflictId,
        });
        conflicts.push({
          conflictId,
          key: neu.key,
          requirementIds: [
            ...competitors.map((c) => c.requirementId),
            neu.requirementId,
          ],
          reason: `Conflicting explicit values for "${neu.key}" without clear override`,
        });
        continue;
      }

      // Override path
      for (const c of competitors) {
        byId.set(c.requirementId, {
          ...c,
          status: "superseded",
          updatedAt: ts,
        });
        overrides.push({
          overrideId: createOverrideId(),
          targetRequirementId: c.requirementId,
          newRequirementId: neu.requirementId,
          sourceInputId: neu.provenance.sourceInputId,
          previousValue: c.value,
          newValue: neu.value,
          reason: `Supersede ${c.key}`,
          createdAt: ts,
        });
      }
      byId.set(neu.requirementId, {
        ...neu,
        status: "active",
        priority: isOverrideIntent(neu)
          ? "explicit_user_override"
          : neu.priority,
        supersedesRequirementId: competitors[0]?.requirementId,
        overriddenRequirementId: competitors[0]?.requirementId,
      });
      continue;
    }

    // Priority comparison
    const best = competitors.reduce((a, b) =>
      CDF_REQUIREMENT_PRIORITY_RANK[a.priority] <=
      CDF_REQUIREMENT_PRIORITY_RANK[b.priority]
        ? a
        : b,
    );
    if (
      CDF_REQUIREMENT_PRIORITY_RANK[neu.priority] <
      CDF_REQUIREMENT_PRIORITY_RANK[best.priority]
    ) {
      for (const c of competitors) {
        byId.set(c.requirementId, {
          ...c,
          status: "superseded",
          updatedAt: ts,
        });
      }
      byId.set(neu.requirementId, {
        ...neu,
        supersedesRequirementId: best.requirementId,
      });
    } else if (
      CDF_REQUIREMENT_PRIORITY_RANK[neu.priority] >
      CDF_REQUIREMENT_PRIORITY_RANK[best.priority]
    ) {
      // Lower authority — keep historical active, mark incoming rejected
      byId.set(neu.requirementId, { ...neu, status: "rejected" });
    } else {
      const conflictId = createConflictId();
      for (const c of competitors) {
        byId.set(c.requirementId, {
          ...c,
          status: "conflicted",
          conflictGroupId: conflictId,
          updatedAt: ts,
        });
      }
      byId.set(neu.requirementId, {
        ...neu,
        status: "conflicted",
        conflictGroupId: conflictId,
      });
      conflicts.push({
        conflictId,
        key: neu.key,
        requirementIds: [
          ...competitors.map((c) => c.requirementId),
          neu.requirementId,
        ],
        reason: `Equal-priority conflict on "${neu.key}"`,
      });
    }
  }

  const allRequirements = [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const active = allRequirements.filter((r) => r.status === "active");

  const version = (input.previousBrief?.version ?? 0) + 1;
  const brief: CdfActiveBrief = {
    activeBriefId: input.previousBrief?.activeBriefId ?? createActiveBriefId(),
    projectId: input.projectId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    version,
    sourceInputIds: [...new Set(input.sourceInputIds)],
    requirementIds: allRequirements.map((r) => r.requirementId),
    activeRequirements: active,
    constraints: active.filter(
      (r) =>
        r.category === "constraint" ||
        r.category === "mandatory_content" ||
        r.category === "quantity" ||
        r.category === "dimension",
    ),
    exclusions: active.filter((r) => r.category === "forbidden_content"),
    references: active.filter(
      (r) => r.category === "reference" || r.category === "asset",
    ),
    decisions: active.filter(
      (r) =>
        r.priority === "approved_user_decision" ||
        r.key.startsWith("approval."),
    ),
    overrides,
    unresolvedConflicts: conflicts,
    createdAt: input.previousBrief?.createdAt ?? ts,
    updatedAt: ts,
  };

  return { brief, allRequirements, overrides };
}

/** Reconstruct ActiveBrief view from persisted requirement set (latest statuses). */
export function reconstructActiveBriefFromRequirements(input: {
  activeBriefId: string;
  version: number;
  sessionId: string;
  serviceId: string;
  projectId?: string;
  sourceInputIds: string[];
  requirements: CdfRequirement[];
  overrides?: CdfRequirementOverride[];
  createdAt?: string;
}): CdfActiveBrief {
  const active = input.requirements.filter((r) => r.status === "active");
  const conflicts: CdfUnresolvedConflict[] = [];
  const groups = new Map<string, CdfRequirement[]>();
  for (const r of input.requirements.filter((x) => x.status === "conflicted")) {
    const g = r.conflictGroupId ?? r.key;
    const list = groups.get(g) ?? [];
    list.push(r);
    groups.set(g, list);
  }
  for (const [conflictId, reqs] of groups) {
    conflicts.push({
      conflictId,
      key: reqs[0]?.key ?? "unknown",
      requirementIds: reqs.map((r) => r.requirementId),
      reason: "Persisted conflict group",
    });
  }
  const ts = nowIso();
  return {
    activeBriefId: input.activeBriefId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    version: input.version,
    sourceInputIds: input.sourceInputIds,
    requirementIds: input.requirements.map((r) => r.requirementId),
    activeRequirements: active,
    constraints: active.filter(
      (r) =>
        r.category === "constraint" ||
        r.category === "mandatory_content" ||
        r.category === "quantity",
    ),
    exclusions: active.filter((r) => r.category === "forbidden_content"),
    references: active.filter((r) => r.category === "reference"),
    decisions: active.filter((r) => r.key.startsWith("approval.")),
    overrides: input.overrides ?? [],
    unresolvedConflicts: conflicts,
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  };
}

export function collectSourceIds(sources: CdfSourceInput[]): string[] {
  return sources.map((s) => s.sourceInputId);
}
