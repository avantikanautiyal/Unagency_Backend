/**
 * M9C — Social Media session ref helpers (exact artifactId@version).
 *
 * generatedArtifacts binding uses the generic CAS primitive
 * (bindGeneratedArtifactToSession) — no SM-specific concurrency path.
 */

import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  type SocialMediaArtifactKey,
} from "../artifacts/social-media/keys";
import {
  bindGeneratedArtifactToSession,
  type BindGeneratedArtifactResult,
} from "../artifacts/generated-bind";
import type { CdfSessionState } from "../types";

/** Phases that lock via select only (no creative approval semantics). */
export const SOCIAL_MEDIA_SELECT_ONLY_PHASES = new Set([
  "platform",
  "size-reference",
  "routes",
]);

export type SocialMediaExactRefRequirement =
  | "approved"
  | "selected_or_approved"
  | "generated_or_above";

export type BindSocialMediaGeneratedSessionResult = BindGeneratedArtifactResult;

export function findSocialMediaExactRef(
  session: CdfSessionState,
  artifactKey: SocialMediaArtifactKey,
  requirement: SocialMediaExactRefRequirement = "selected_or_approved",
): { artifactId: string; version: number } | undefined {
  const fromApproved = session.approvedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );
  const fromSelected = session.selectedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );
  const fromGenerated = session.generatedArtifacts?.find(
    (r) => r.artifactKey === artifactKey,
  );

  if (requirement === "approved") {
    if (fromApproved) {
      return {
        artifactId: fromApproved.artifactId,
        version: fromApproved.version,
      };
    }
    return undefined;
  }

  if (requirement === "selected_or_approved") {
    if (fromApproved) {
      return {
        artifactId: fromApproved.artifactId,
        version: fromApproved.version,
      };
    }
    if (fromSelected) {
      return {
        artifactId: fromSelected.artifactId,
        version: fromSelected.version,
      };
    }
    return undefined;
  }

  if (fromApproved) {
    return {
      artifactId: fromApproved.artifactId,
      version: fromApproved.version,
    };
  }
  if (fromSelected) {
    return {
      artifactId: fromSelected.artifactId,
      version: fromSelected.version,
    };
  }
  if (fromGenerated) {
    return {
      artifactId: fromGenerated.artifactId,
      version: fromGenerated.version,
    };
  }
  return undefined;
}

/** Persist exact generated ref — delegates to generic CAS bind. */
export function bindGeneratedSocialMediaArtifactToSession(input: {
  sessionId: string;
  phaseId: string;
  artifactId: string;
  version: number;
  artifactKey: string;
  organizationId?: string;
  projectId?: string;
  expectedVersion?: number;
  generationFanoutGroupId?: string;
  generationFanoutTargetId?: string;
  generationExecutionId?: string;
  generationFanoutLeaf?: boolean;
}): BindSocialMediaGeneratedSessionResult {
  return bindGeneratedArtifactToSession(input);
}

export function sessionHasSocialMediaCanonicalRefs(
  session: CdfSessionState,
): boolean {
  const keys = new Set(Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS));
  const lists = [
    session.approvedArtifacts,
    session.selectedArtifacts,
    session.generatedArtifacts,
  ];
  for (const list of lists) {
    for (const r of list ?? []) {
      if (keys.has(r.artifactKey as SocialMediaArtifactKey)) return true;
    }
  }
  return false;
}

export function socialMediaDependencySatisfied(
  session: CdfSessionState,
  dependencyPhaseId: string,
): { ok: true } | { ok: false; reason: "missing" | "not_approved" } {
  const { cdfDependencySatisfied } =
    require("../lifecycle/dependency-satisfaction") as typeof import("../lifecycle/dependency-satisfaction");
  const sat = cdfDependencySatisfied(session, dependencyPhaseId, {
    serviceId: session.serviceId,
    dependingPhaseId: session.phaseId ?? undefined,
  });
  if (sat.ok) return { ok: true };
  return {
    ok: false,
    reason:
      sat.reason === "not_approved" || sat.reason === "not_selected"
        ? "not_approved"
        : "missing",
  };
}
