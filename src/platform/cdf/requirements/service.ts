/**
 * CDF Requirement Engine domain service (M2).
 * Owns requirement state — does NOT advance CDF phases.
 */

import {
  createSourceInputId,
  checksumText,
  resetCdfRequirementIdsForTests,
} from "./ids";
import { extractRequirementsFromSource } from "./extractor";
import { resolveActiveRequirements } from "./resolver";
import {
  buildRequirementContextSnapshot,
  formatRequirementSnapshotForPrompt,
} from "./snapshot";
import {
  ensureRequirementBagLoaded,
  getLatestActiveBrief,
  listActiveBriefVersions,
  listRequirements,
  listSourceInputs,
  nextSourceSequence,
  replaceResolvedRequirements,
  resetCdfRequirementStoreForTests,
  saveActiveBrief,
  saveRequirements,
  saveSourceInput,
} from "./store";
import {
  assertValidOrThrow,
  validateActiveBrief,
  validateRequirement,
  validateSourceInput,
} from "./validation";
import type {
  CdfActiveBrief,
  CdfRequirement,
  CdfRequirementContextSnapshot,
  CdfSourceInput,
  CdfSourceInputType,
} from "./types";

export type CaptureSourceResult = {
  source: CdfSourceInput;
  requirements: CdfRequirement[];
  brief: CdfActiveBrief;
  snapshot: CdfRequirementContextSnapshot;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function resetCdfRequirementEngineForTests(): void {
  resetCdfRequirementStoreForTests();
  resetCdfRequirementIdsForTests();
}

function captureSourceAndResolveCore(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  userId?: string;
  type: CdfSourceInputType;
  rawContent: string;
  metadata?: Record<string, unknown>;
  source?: string;
  parentSourceInputId?: string;
}): CaptureSourceResult {
  const source: CdfSourceInput = {
    sourceInputId: createSourceInputId(),
    projectId: input.projectId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    type: input.type,
    rawContent: input.rawContent,
    metadata: input.metadata,
    source: input.source,
    createdAt: nowIso(),
    createdBy: input.userId,
    sequence: nextSourceSequence(input.sessionId),
    parentSourceInputId: input.parentSourceInputId,
    checksum: checksumText(input.rawContent),
  };

  assertValidOrThrow(validateSourceInput(source));
  saveSourceInput(source);

  const extracted = extractRequirementsFromSource(source, {
    projectId: input.projectId,
  });
  for (const r of extracted) {
    assertValidOrThrow(validateRequirement(r));
  }

  const historical = listRequirements(input.sessionId);
  const previous = getLatestActiveBrief(input.sessionId) ?? null;
  const sources = listSourceInputs(input.sessionId);

  const resolved = resolveActiveRequirements({
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    projectId: input.projectId,
    historical,
    incoming: extracted,
    sourceInputIds: sources.map((s) => s.sourceInputId),
    previousBrief: previous,
  });

  const newOnes = resolved.allRequirements.filter(
    (r) => !historical.some((h) => h.requirementId === r.requirementId),
  );
  saveRequirements(newOnes);
  replaceResolvedRequirements(input.sessionId, resolved.allRequirements);

  const brief = saveActiveBrief(resolved.brief);
  assertValidOrThrow(
    validateActiveBrief(brief, listRequirements(input.sessionId), sources),
  );

  const snapshot = buildRequirementContextSnapshot({
    brief,
    sources: listSourceInputs(input.sessionId),
  });

  return {
    source,
    requirements: resolved.allRequirements,
    brief,
    snapshot,
  };
}

/** Sync capture for state-machine / tests (memory; Mongo best-effort async). */
export function captureSourceAndResolveSync(
  input: Parameters<typeof captureSourceAndResolveCore>[0],
): CaptureSourceResult {
  return captureSourceAndResolveCore(input);
}

export async function captureSourceAndResolve(input: {
  sessionId: string;
  serviceId: string;
  projectId?: string;
  userId?: string;
  type: CdfSourceInputType;
  rawContent: string;
  metadata?: Record<string, unknown>;
  source?: string;
  parentSourceInputId?: string;
}): Promise<CaptureSourceResult> {
  await ensureRequirementBagLoaded(input.sessionId);
  return captureSourceAndResolveCore(input);
}

export function getRequirementQuery(sessionId: string): {
  sources: CdfSourceInput[];
  requirements: CdfRequirement[];
  activeRequirements: CdfRequirement[];
  historicalRequirements: CdfRequirement[];
  brief?: CdfActiveBrief;
  briefVersions: CdfActiveBrief[];
  overrides: CdfActiveBrief["overrides"];
  conflicts: CdfActiveBrief["unresolvedConflicts"];
  snapshot?: CdfRequirementContextSnapshot;
  promptBlock?: string;
} {
  const sources = listSourceInputs(sessionId);
  const requirements = listRequirements(sessionId);
  const brief = getLatestActiveBrief(sessionId);
  const snapshot = brief
    ? buildRequirementContextSnapshot({ brief, sources })
    : undefined;
  return {
    sources,
    requirements,
    activeRequirements: requirements.filter((r) => r.status === "active"),
    historicalRequirements: requirements.filter((r) => r.status !== "active"),
    brief,
    briefVersions: listActiveBriefVersions(sessionId),
    overrides: brief?.overrides ?? [],
    conflicts: brief?.unresolvedConflicts ?? [],
    snapshot,
    promptBlock: snapshot
      ? formatRequirementSnapshotForPrompt(snapshot)
      : undefined,
  };
}

export { formatRequirementSnapshotForPrompt, buildRequirementContextSnapshot };
