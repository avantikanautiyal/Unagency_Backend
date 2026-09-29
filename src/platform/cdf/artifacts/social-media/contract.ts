/**
 * Social Media phase ↔ artifact contract overlay (M9A).
 * Extends M1 registry semantics without duplicating the full CDF registry.
 */

import { resolveCdfCanonicalService } from "../../canonical";
import {
  SOCIAL_MEDIA_ARTIFACT_KEYS,
  SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY,
  SOCIAL_MEDIA_PHASE_ARTIFACT_KEY,
  socialMediaSchemaId,
  type SocialMediaArtifactKey,
} from "./keys";
import { SOCIAL_MEDIA_DEPENDENCY_GRAPH } from "./schemas";

export type SocialMediaPhaseContractRow = {
  phaseId: string;
  phaseOrder: number;
  artifactKey: SocialMediaArtifactKey | null;
  artifactType: string | null;
  schemaId: string | null;
  interactionType: string;
  generationModality: string;
  dependencyPhaseIds: string[];
  dependencyArtifactKeys: readonly SocialMediaArtifactKey[];
  cardinality: unknown;
  selectionBehavior: string;
  approvalBehavior: string;
  refinementSupport: boolean;
  finalOutputExpectation: string;
  nextAction: string;
};

/**
 * Canonical Social Media dependency graph (exact artifact versions at persist):
 *
 *   platform (config)
 *      ↓
 *   size-reference (config)
 *      ↓
 *   routes (text ×3; selectedRouteId on select; ≠ approval)
 *      ↓
 *   output (single image creative; approval required)
 *      ↓
 *   final (Download / Create Another Size / Request Adaptation — no creative schema)
 */
export function getSocialMediaDependencyGraph(): typeof SOCIAL_MEDIA_DEPENDENCY_GRAPH {
  return SOCIAL_MEDIA_DEPENDENCY_GRAPH;
}

export function listSocialMediaPhaseContracts(): SocialMediaPhaseContractRow[] {
  const svc = resolveCdfCanonicalService("social-media");
  if (!svc) return [];

  const rows: SocialMediaPhaseContractRow[] = [];
  for (const phase of svc.phases) {
    const artifactKey = SOCIAL_MEDIA_PHASE_ARTIFACT_KEY[phase.phaseId] ?? null;
    const m1Key = phase.artifact?.artifactKey ?? null;
    const resolvedKey =
      artifactKey ??
      (m1Key && m1Key in SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY
        ? (m1Key as SocialMediaArtifactKey)
        : null);

    rows.push({
      phaseId: phase.phaseId,
      phaseOrder: phase.phaseOrder,
      artifactKey: resolvedKey,
      artifactType: resolvedKey
        ? SOCIAL_MEDIA_ARTIFACT_TYPE_BY_KEY[resolvedKey]
        : phase.artifact?.artifactType ?? null,
      schemaId: resolvedKey ? socialMediaSchemaId(resolvedKey) : null,
      interactionType: phase.uxType,
      generationModality: phase.generationModality,
      dependencyPhaseIds: (phase.dependencies ?? []).map((d) => d.phaseId),
      dependencyArtifactKeys: resolvedKey
        ? SOCIAL_MEDIA_DEPENDENCY_GRAPH[resolvedKey]
        : [],
      cardinality: phase.cardinality ?? phase.artifact?.cardinality,
      selectionBehavior: phase.selection.mode,
      approvalBehavior: phase.approval.mode,
      refinementSupport: Boolean(phase.refinement.enabled),
      finalOutputExpectation:
        phase.phaseId === "final"
          ? "Download primary png; Create Another Size / Request Adaptation"
          : "Canonical social-media artifact version (future materializer)",
      nextAction:
        phase.phaseId === "final"
          ? "faDownload / faOther"
          : phase.phaseId === "output"
            ? "approve → final"
            : "select → advance phase",
    });
  }
  return rows;
}

/** Verify M1 social-media phase artifactKeys align with M9A vocabulary. */
export function assertSocialMediaContractKeyAlignment(): {
  ok: boolean;
  mismatches: string[];
} {
  const svc = resolveCdfCanonicalService("social-media");
  const mismatches: string[] = [];
  if (!svc) {
    return {
      ok: false,
      mismatches: ["social-media service missing from registry"],
    };
  }
  for (const phase of svc.phases) {
    if (phase.phaseId === "final") continue;
    const expected = SOCIAL_MEDIA_PHASE_ARTIFACT_KEY[phase.phaseId];
    const actual = phase.artifact?.artifactKey;
    if (!expected) {
      mismatches.push(`No M9A mapping for phase ${phase.phaseId}`);
      continue;
    }
    if (actual !== expected) {
      mismatches.push(
        `phase ${phase.phaseId}: M1 key "${actual}" ≠ M9A "${expected}"`,
      );
    }
  }
  for (const key of Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS)) {
    const hit = svc.phases.some((p) => p.artifact?.artifactKey === key);
    if (!hit) {
      mismatches.push(`M9A key ${key} not present on any social-media phase`);
    }
  }
  // final must not register a creative schema key in M9A
  const finalPhase = svc.phases.find((p) => p.phaseId === "final");
  if (finalPhase?.artifact?.artifactKey === "social-media.final") {
    // M1 still declares social-media.final on the phase — M9A deliberately
    // omits a creative schema. Document as alignment note, not mismatch.
  }
  return { ok: mismatches.length === 0, mismatches };
}

export const SOCIAL_MEDIA_ARTIFACT_CONTRACT = {
  contractId: "unagency.social_media.artifact.v1",
  serviceId: "social-media",
  schemaVersion: "1",
  creativeKeys: Object.values(SOCIAL_MEDIA_ARTIFACT_KEYS),
  finalHasCreativeSchema: false,
  platformsAreConfigNotArtifactTypes: true,
  carouselNotInCdfPhaseGraph: true,
  captionNotInCdfCreativePath: true,
  confirmedRepresentations: ["png", "preview"] as const,
  unresolvedRepresentations: ["mp4", "gif", "carousel_zip", "story_pack"] as const,
  liveTrafficMigrated: false,
  sessionRefShapeFuture: {
    artifactId: "cdfart_*",
    version: "integer >= 1",
    artifactKey: "social-media.*",
    phaseId: "platform|size-reference|routes|output",
    role: "generated|selected|approved",
  },
} as const;
