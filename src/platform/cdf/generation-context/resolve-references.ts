/**
 * CDF adapter — run generation reference resolution against session + upstream.
 * No Requirement Engine / dependency re-resolution. Optional exact version lookup
 * only when the user explicitly names a version for an already-authorized artifactId.
 */

import {
  buildGenerationReferenceCandidates,
  ctiHintFromMetadata,
  parseExplicitVersionNumber,
  resolveGenerationReferences,
  selectedSlideNumberFromMetadata,
  summarizeGenerationReferencesForTrace,
  type GenerationReferenceCandidate,
  type GenerationReferenceResolutionResult,
} from "../../ai/reference-resolution";
import { getArtifactVersion } from "../artifacts/repository";
import type { CdfSessionState } from "../types";
import type { UpstreamArtifactContext } from "./types";

export function expandExplicitVersionCandidates(input: {
  readonly instruction: string;
  readonly candidates: readonly GenerationReferenceCandidate[];
  readonly organizationId?: string;
  readonly projectId?: string;
}): GenerationReferenceCandidate[] {
  const version = parseExplicitVersionNumber(input.instruction);
  if (version == null) return [...input.candidates];

  const out: GenerationReferenceCandidate[] = [...input.candidates];
  const seen = new Set(out.map((c) => `${c.artifactId}@${c.version}`));
  const artifactIds = [...new Set(out.map((c) => c.artifactId))];

  for (const artifactId of artifactIds) {
    const key = `${artifactId}@${version}`;
    if (seen.has(key)) continue;
    try {
      const ver = getArtifactVersion(artifactId, version, {
        organizationId: input.organizationId,
        projectId: input.projectId,
      });
      if (!ver) continue;
      const proto = out.find((c) => c.artifactId === artifactId);
      out.push({
        artifactId,
        version,
        artifactKey: proto?.artifactKey,
        phaseId: proto?.phaseId,
        sessionRole: proto?.sessionRole,
        role: proto?.role,
        slideCount: proto?.slideCount,
        slideIds: proto?.slideIds,
      });
      seen.add(key);
    } catch {
      // Ownership / missing — leave unresolved rather than invent.
    }
  }
  return out;
}

export function resolveCanonicalGenerationReferences(input: {
  readonly instruction: string;
  readonly session: CdfSessionState;
  readonly phaseId: string;
  readonly upstream: readonly UpstreamArtifactContext[];
  readonly metadata?: Record<string, unknown>;
  readonly organizationId?: string;
  readonly projectId?: string;
}): GenerationReferenceResolutionResult {
  const base = buildGenerationReferenceCandidates({
    session: input.session,
    upstream: input.upstream,
  });
  const candidates = expandExplicitVersionCandidates({
    instruction: input.instruction,
    candidates: base,
    organizationId: input.organizationId ?? input.session.organizationId,
    projectId: input.projectId ?? input.session.projectId,
  });
  const cti = ctiHintFromMetadata(input.metadata);
  return resolveGenerationReferences({
    instruction: input.instruction,
    phaseId: input.phaseId,
    serviceId: input.session.serviceId,
    candidates,
    selectedSlideNumber: selectedSlideNumberFromMetadata(input.metadata),
    ctiArtifactId: cti.artifactId,
    ctiArtifactVersion: cti.version,
  });
}

export { summarizeGenerationReferencesForTrace };
