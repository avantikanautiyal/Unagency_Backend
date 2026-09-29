/**
 * Packaging phase ↔ artifact contract overlay (M8A).
 * Extends M1 registry semantics without duplicating the full CDF registry.
 */

import { resolveCdfCanonicalService } from "../../canonical";
import {
  PACKAGING_ARTIFACT_KEYS,
  PACKAGING_ARTIFACT_TYPE_BY_KEY,
  PACKAGING_PHASE_ARTIFACT_KEY,
  packagingSchemaId,
  type PackagingArtifactKey,
} from "./keys";
import { PACKAGING_DEPENDENCY_GRAPH } from "./schemas";

export type PackagingPhaseContractRow = {
  phaseId: string;
  phaseOrder: number;
  artifactKey: PackagingArtifactKey | null;
  artifactType: string | null;
  schemaId: string | null;
  interactionType: string;
  generationModality: string;
  dependencyPhaseIds: string[];
  dependencyArtifactKeys: readonly PackagingArtifactKey[];
  cardinality: unknown;
  selectionBehavior: string;
  approvalBehavior: string;
  refinementSupport: boolean;
  finalOutputExpectation: string;
  nextAction: string;
};

/**
 * Canonical Packaging dependency graph (exact artifact versions required at persist):
 *
 *   dieline
 *      ↓
 *   routes  (selectedRouteId on select; ≠ approval)
 *      ↓
 *   3d-direction
 *      ↓
 *   front-pack
 *      ↓
 *   complete-pack  (pins dieline+routes+3d+front exact versions)
 *      ↓
 *   views
 *      ↓
 *   sku-adaptations
 *      ↓
 *   final (downloads / another SKU — no creative schema)
 */
export function getPackagingDependencyGraph(): typeof PACKAGING_DEPENDENCY_GRAPH {
  return PACKAGING_DEPENDENCY_GRAPH;
}

export function listPackagingPhaseContracts(): PackagingPhaseContractRow[] {
  const svc = resolveCdfCanonicalService("packaging");
  if (!svc) return [];

  const rows: PackagingPhaseContractRow[] = [];
  for (const phase of svc.phases) {
    const artifactKey = PACKAGING_PHASE_ARTIFACT_KEY[phase.phaseId] ?? null;
    const m1Key = phase.artifact?.artifactKey ?? null;
    // Prefer M8A mapping; assert M1 key matches when both present
    const resolvedKey =
      artifactKey ??
      (m1Key && m1Key in PACKAGING_ARTIFACT_TYPE_BY_KEY
        ? (m1Key as PackagingArtifactKey)
        : null);

    rows.push({
      phaseId: phase.phaseId,
      phaseOrder: phase.phaseOrder,
      artifactKey: resolvedKey,
      artifactType: resolvedKey
        ? PACKAGING_ARTIFACT_TYPE_BY_KEY[resolvedKey]
        : phase.artifact?.artifactType ?? null,
      schemaId: resolvedKey ? packagingSchemaId(resolvedKey) : null,
      interactionType: phase.uxType,
      generationModality: phase.generationModality,
      dependencyPhaseIds: (phase.dependencies ?? []).map((d) => d.phaseId),
      dependencyArtifactKeys: resolvedKey
        ? PACKAGING_DEPENDENCY_GRAPH[resolvedKey]
        : [],
      cardinality: phase.cardinality ?? phase.artifact?.cardinality,
      selectionBehavior: phase.selection.mode,
      approvalBehavior: phase.approval.mode,
      refinementSupport: Boolean(phase.refinement.enabled),
      finalOutputExpectation:
        phase.phaseId === "final"
          ? "Download packaging files / 3D mockups; optional another SKU"
          : "Canonical packaging artifact version (future materializer)",
      nextAction:
        phase.phaseId === "final"
          ? "faDownload / faOther"
          : "approve → advance phase",
    });
  }
  return rows;
}

/** Verify M1 packaging phase artifactKeys align with M8A vocabulary. */
export function assertPackagingContractKeyAlignment(): {
  ok: boolean;
  mismatches: string[];
} {
  const svc = resolveCdfCanonicalService("packaging");
  const mismatches: string[] = [];
  if (!svc) {
    return { ok: false, mismatches: ["packaging service missing from registry"] };
  }
  for (const phase of svc.phases) {
    if (phase.phaseId === "final") continue;
    const expected = PACKAGING_PHASE_ARTIFACT_KEY[phase.phaseId];
    const actual = phase.artifact?.artifactKey;
    if (!expected) {
      mismatches.push(`No M8A mapping for phase ${phase.phaseId}`);
      continue;
    }
    if (actual !== expected) {
      mismatches.push(
        `phase ${phase.phaseId}: M1 key "${actual}" ≠ M8A "${expected}"`,
      );
    }
  }
  // Ensure every M8A key appears
  for (const key of Object.values(PACKAGING_ARTIFACT_KEYS)) {
    const hit = svc.phases.some((p) => p.artifact?.artifactKey === key);
    if (!hit) {
      mismatches.push(`M8A key ${key} not present on any packaging phase`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
