/**
 * In-memory + optional Mongo persistence for CDF Requirement Engine (M2).
 */

import type {
  CdfActiveBrief,
  CdfRequirement,
  CdfSourceInput,
} from "./types";

export type CdfRequirementSessionBag = {
  sources: CdfSourceInput[];
  requirements: CdfRequirement[];
  briefs: CdfActiveBrief[];
  activeBriefId?: string;
};

const bySession = new Map<string, CdfRequirementSessionBag>();

export function resetCdfRequirementStoreForTests(): void {
  bySession.clear();
}

function bag(sessionId: string): CdfRequirementSessionBag {
  let b = bySession.get(sessionId);
  if (!b) {
    b = { sources: [], requirements: [], briefs: [] };
    bySession.set(sessionId, b);
  }
  return b;
}

export function saveSourceInput(source: CdfSourceInput): CdfSourceInput {
  const b = bag(source.sessionId);
  const idx = b.sources.findIndex((s) => s.sourceInputId === source.sourceInputId);
  if (idx >= 0) {
    // Immutable: do not overwrite rawContent of existing source
    return b.sources[idx]!;
  }
  b.sources.push(source);
  void persistSessionBagAsync(source.sessionId);
  return source;
}

export function saveRequirements(requirements: CdfRequirement[]): void {
  if (!requirements.length) return;
  const sessionId = requirements[0]!.sessionId;
  const b = bag(sessionId);
  for (const r of requirements) {
    const idx = b.requirements.findIndex((x) => x.requirementId === r.requirementId);
    if (idx >= 0) {
      // Historical immutability: only status/lineage fields may update
      const prev = b.requirements[idx]!;
      b.requirements[idx] = {
        ...prev,
        status: r.status,
        supersedesRequirementId: r.supersedesRequirementId ?? prev.supersedesRequirementId,
        overriddenRequirementId: r.overriddenRequirementId ?? prev.overriddenRequirementId,
        conflictGroupId: r.conflictGroupId ?? prev.conflictGroupId,
        updatedAt: r.updatedAt,
      };
      // Guard: reject value mutation
      if (JSON.stringify(prev.value) !== JSON.stringify(r.value)) {
        b.requirements[idx] = prev;
        throw new Error(
          `Immutable requirement violated: ${r.requirementId} value mutation`,
        );
      }
    } else {
      b.requirements.push(r);
    }
  }
  void persistSessionBagAsync(sessionId);
}

/** Replace requirement set after resolution (status updates only on known ids). */
export function replaceResolvedRequirements(
  sessionId: string,
  all: CdfRequirement[],
): void {
  const b = bag(sessionId);
  const existing = new Map(b.requirements.map((r) => [r.requirementId, r]));
  const next: CdfRequirement[] = [];
  for (const r of all) {
    const prev = existing.get(r.requirementId);
    if (prev) {
      if (JSON.stringify(prev.value) !== JSON.stringify(r.value)) {
        throw new Error(
          `Immutable requirement violated: ${r.requirementId} value mutation`,
        );
      }
      if (prev.key !== r.key || prev.explicit !== r.explicit) {
        throw new Error(
          `Immutable requirement violated: ${r.requirementId} identity mutation`,
        );
      }
      next.push({
        ...prev,
        status: r.status,
        supersedesRequirementId: r.supersedesRequirementId,
        overriddenRequirementId: r.overriddenRequirementId,
        conflictGroupId: r.conflictGroupId,
        updatedAt: r.updatedAt,
        priority: r.priority,
      });
    } else {
      next.push(r);
    }
  }
  b.requirements = next;
  void persistSessionBagAsync(sessionId);
}

export function saveActiveBrief(brief: CdfActiveBrief): CdfActiveBrief {
  const b = bag(brief.sessionId);
  const prev = b.briefs[b.briefs.length - 1];
  if (prev && brief.version < prev.version) {
    throw new Error(
      `ActiveBrief version regression: ${brief.version} < ${prev.version}`,
    );
  }
  if (prev && brief.version === prev.version) {
    // Same version — reject destructive mutate; return previous
    return prev;
  }
  b.briefs.push(brief);
  b.activeBriefId = brief.activeBriefId;
  void persistSessionBagAsync(brief.sessionId);
  return brief;
}

export function listSourceInputs(sessionId: string): CdfSourceInput[] {
  return [...bag(sessionId).sources].sort((a, b) => a.sequence - b.sequence);
}

export function listRequirements(sessionId: string): CdfRequirement[] {
  return [...bag(sessionId).requirements];
}

export function listActiveBriefVersions(sessionId: string): CdfActiveBrief[] {
  return [...bag(sessionId).briefs];
}

export function getLatestActiveBrief(
  sessionId: string,
): CdfActiveBrief | undefined {
  const b = bag(sessionId);
  return b.briefs[b.briefs.length - 1];
}

export function getActiveBriefByVersion(
  sessionId: string,
  version: number,
): CdfActiveBrief | undefined {
  return bag(sessionId).briefs.find((x) => x.version === version);
}

export function nextSourceSequence(sessionId: string): number {
  const sources = bag(sessionId).sources;
  if (!sources.length) return 1;
  return Math.max(...sources.map((s) => s.sequence)) + 1;
}

async function persistSessionBagAsync(sessionId: string): Promise<void> {
  try {
    const { persistCdfRequirementBagToMongo } = await import(
      "../../infrastructure/durability/mongo/models/cdf-requirement.model"
    );
    await persistCdfRequirementBagToMongo(sessionId, bag(sessionId));
  } catch {
    // Mongo optional
  }
}

/**
 * Hydrate requirement bag from Mongo when memory is empty / placeholder-only.
 * Exact ActiveBrief versions live in bag.briefs — must survive process restart.
 */
export async function ensureRequirementBagLoaded(
  sessionId: string,
): Promise<void> {
  const existing = bySession.get(sessionId);
  const hasDurableContent =
    !!existing &&
    (existing.briefs.length > 0 ||
      existing.sources.length > 0 ||
      existing.requirements.length > 0);
  if (hasDurableContent) return;

  try {
    const { loadCdfRequirementBagFromMongo } = await import(
      "../../infrastructure/durability/mongo/models/cdf-requirement.model"
    );
    const loaded = await loadCdfRequirementBagFromMongo(sessionId);
    if (loaded) {
      bySession.set(sessionId, loaded);
    }
  } catch {
    // Mongo optional for unit tests without a connection
  }
}

export type { CdfRequirementSessionBag };
