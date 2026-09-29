/**
 * Packaging structural + dependency checks (M8C / M4).
 * Shared generation-validation architecture — not a parallel engine.
 */

import { PACKAGING_ARTIFACT_KEYS } from "../artifacts/packaging/keys";
import { PACKAGING_DEPENDENCY_GRAPH } from "../artifacts/packaging/schemas";
import type {
  ArtifactObservation,
  CdfValidationCheck,
} from "./types";
import { nextPackagingCheckId } from "./packaging-check-ids";

function check(
  partial: Omit<CdfValidationCheck, "checkId" | "requirementId"> & {
    requirementKey?: string;
  },
): CdfValidationCheck {
  return {
    checkId: nextPackagingCheckId(partial.fieldPath),
    requirementId: `packaging.structural.${partial.fieldPath}`,
    requirementKey: partial.requirementKey ?? partial.fieldPath,
    ...partial,
  };
}

function assertNoForbiddenIdentities(obs: ArtifactObservation): CdfValidationCheck[] {
  const out: CdfValidationCheck[] = [];
  if (obs.hasLatestRef) {
    out.push(
      check({
        category: "reference",
        verificationType: "structural_absence",
        capability: "machine_verifiable",
        fieldPath: "latest_ref",
        expected: "exact version only",
        actual: "latest",
        status: "fail",
        severity: "blocking",
        evidence: 'Canonical Packaging data must not use "latest" references.',
      }),
    );
  }
  if (obs.hasExecAsAsset) {
    out.push(
      check({
        category: "reference",
        verificationType: "structural_absence",
        capability: "machine_verifiable",
        fieldPath: "exec_as_asset",
        expected: "Vault ObjectId",
        actual: "exec_*",
        status: "fail",
        severity: "blocking",
        evidence: "Execution IDs must not appear as Vault asset identities.",
      }),
    );
  }
  if (obs.hasArtAsAsset) {
    out.push(
      check({
        category: "reference",
        verificationType: "structural_absence",
        capability: "machine_verifiable",
        fieldPath: "art_as_asset",
        expected: "Vault ObjectId",
        actual: "art_*",
        status: "fail",
        severity: "blocking",
        evidence: "Legacy art_* media IDs must not satisfy Vault asset identity.",
      }),
    );
  }
  if (obs.hasCdfartAsVault) {
    out.push(
      check({
        category: "reference",
        verificationType: "structural_absence",
        capability: "machine_verifiable",
        fieldPath: "cdfart_as_vault",
        expected: "Vault ObjectId",
        actual: "cdfart_*",
        status: "fail",
        severity: "blocking",
        evidence: "CDF artifact IDs must not be used where Vault ObjectIds are required.",
      }),
    );
  }
  return out;
}

function checkDuplicateIds(obs: ArtifactObservation): CdfValidationCheck[] {
  if (!obs.duplicateIds?.length) return [];
  return [
    check({
      category: "structure",
      verificationType: "structural_absence",
      capability: "machine_verifiable",
      fieldPath: "duplicate_ids",
      expected: "unique stable ids",
      actual: obs.duplicateIds,
      status: "fail",
      severity: "blocking",
      evidence: `Duplicate stable IDs: ${obs.duplicateIds.join(", ")}`,
    }),
  ];
}

function checkExactRef(
  label: string,
  actual: { artifactId: string; version: number } | undefined,
  expected?: { artifactId: string; version: number },
  required = true,
): CdfValidationCheck {
  if (!required && !expected && !actual) {
    return check({
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: label,
      expected: null,
      actual: null,
      status: "not_applicable",
      severity: "informational",
      evidence: `${label} optional and absent.`,
    });
  }
  if (expected) {
    const passed =
      actual?.artifactId === expected.artifactId &&
      actual?.version === expected.version;
    return check({
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: label,
      expected,
      actual: actual ?? null,
      status: passed ? "pass" : "fail",
      severity: "blocking",
      evidence: passed
        ? `${label} matches exact ${expected.artifactId}@${expected.version}.`
        : `${label} expected ${expected.artifactId}@${expected.version}, got ${
            actual ? `${actual.artifactId}@${actual.version}` : "missing"
          }.`,
    });
  }
  if (required && !actual) {
    return check({
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: label,
      expected: "exact artifactId+version",
      actual: null,
      status: "fail",
      severity: "blocking",
      evidence: `${label} missing exact upstream reference.`,
    });
  }
  if (actual && (!Number.isInteger(actual.version) || actual.version < 1)) {
    return check({
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: label,
      expected: "version >= 1",
      actual,
      status: "fail",
      severity: "blocking",
      evidence: `${label} has invalid version.`,
    });
  }
  return check({
    category: "reference",
    verificationType: "reference_match",
    capability: "machine_verifiable",
    fieldPath: label,
    expected: "exact artifactId+version",
    actual: actual ?? null,
    status: actual ? "pass" : "not_applicable",
    severity: "informational",
    evidence: actual
      ? `${label} pins ${actual.artifactId}@${actual.version}.`
      : `${label} not required.`,
  });
}

/**
 * Always-on Packaging structural checks (independent of ActiveBrief).
 */
export function runPackagingStructuralChecks(
  obs: ArtifactObservation,
): CdfValidationCheck[] {
  const out: CdfValidationCheck[] = [
    ...assertNoForbiddenIdentities(obs),
    ...checkDuplicateIds(obs),
  ];

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.dieline) {
    if (!obs.pathKind) {
      out.push(
        check({
          category: "structure",
          verificationType: "structural_presence",
          capability: "machine_verifiable",
          fieldPath: "pathKind",
          expected: "upload_dieline|none|existing_pack",
          actual: null,
          status: "fail",
          severity: "blocking",
          evidence: "packaging.dieline requires pathKind.",
        }),
      );
    }
    if (obs.geometryUnresolved) {
      out.push(
        check({
          category: "geometry",
          verificationType: "structural_presence",
          capability: "unable_to_verify",
          fieldPath: "geometry",
          expected: "structured dieline geometry",
          actual: "unresolved",
          status: "unable_to_verify",
          severity: "informational",
          evidence:
            "Structured dieline geometry is unresolved — not fabricated; geometry-dependent checks cannot PASS.",
        }),
      );
    }
    if (obs.physicalDimensionsMm) {
      const d = obs.physicalDimensionsMm;
      const ok =
        Number.isFinite(d.widthMm) &&
        d.widthMm > 0 &&
        Number.isFinite(d.heightMm) &&
        d.heightMm > 0 &&
        (d.depthMm == null || (Number.isFinite(d.depthMm) && d.depthMm > 0));
      out.push(
        check({
          category: "dimensions",
          verificationType: "dimensions",
          capability: "machine_verifiable",
          fieldPath: "dimensions",
          expected: "positive mm",
          actual: d,
          status: ok ? "pass" : "fail",
          severity: "blocking",
          evidence: ok
            ? "Physical dimensions are valid mm values."
            : "Invalid physical dimensions.",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.routes) {
    if (!obs.routeCount || obs.routeCount < 1) {
      out.push(
        check({
          category: "structure",
          verificationType: "count",
          capability: "machine_verifiable",
          fieldPath: "routes",
          expected: ">=1",
          actual: obs.routeCount ?? 0,
          status: "fail",
          severity: "blocking",
          evidence: "packaging.routes requires a non-empty routes[].",
        }),
      );
    }
    if (
      obs.selectedRouteId &&
      obs.routeIds &&
      !obs.routeIds.includes(obs.selectedRouteId)
    ) {
      out.push(
        check({
          category: "selection",
          verificationType: "exact_match",
          capability: "machine_verifiable",
          fieldPath: "selectedRouteId",
          expected: obs.routeIds,
          actual: obs.selectedRouteId,
          status: "fail",
          severity: "blocking",
          evidence: "selectedRouteId does not match any routeId.",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.threeDDirection) {
    if (obs.structuredSceneUnresolved) {
      out.push(
        check({
          category: "geometry",
          verificationType: "structural_presence",
          capability: "unable_to_verify",
          fieldPath: "structured_scene",
          expected: "3D scene graph",
          actual: "unresolved",
          status: "unable_to_verify",
          severity: "informational",
          evidence:
            "Structured 3D scene graph is unavailable — preview/direction metadata only; not claiming geometry validated.",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.frontPack) {
    if (!obs.surfaceIds?.length) {
      out.push(
        check({
          category: "structure",
          verificationType: "structural_presence",
          capability: "machine_verifiable",
          fieldPath: "frontId",
          expected: "stable front surface id",
          actual: null,
          status: "fail",
          severity: "blocking",
          evidence: "front-pack requires stable frontId.",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.completePack) {
    if (!obs.surfaceIds?.length) {
      out.push(
        check({
          category: "structure",
          verificationType: "structural_presence",
          capability: "machine_verifiable",
          fieldPath: "surfaces",
          expected: ">=1 surface",
          actual: 0,
          status: "fail",
          severity: "blocking",
          evidence: "complete-pack requires surfaces[].",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.views) {
    if (!obs.viewIds?.length) {
      out.push(
        check({
          category: "structure",
          verificationType: "count",
          capability: "machine_verifiable",
          fieldPath: "views",
          expected: ">=1",
          actual: 0,
          status: "fail",
          severity: "blocking",
          evidence: "views requires views[].",
        }),
      );
    }
  }

  if (obs.artifactKey === PACKAGING_ARTIFACT_KEYS.skuAdaptations) {
    if (!obs.skuCount || obs.skuCount < 1) {
      out.push(
        check({
          category: "structure",
          verificationType: "count",
          capability: "machine_verifiable",
          fieldPath: "skus",
          expected: ">=1",
          actual: obs.skuCount ?? 0,
          status: "fail",
          severity: "blocking",
          evidence: "sku-adaptations requires skus[].",
        }),
      );
    }
  }

  return out;
}

export type PackagingExpectedRefs = {
  dielineRef?: { artifactId: string; version: number };
  routesRef?: { artifactId: string; version: number };
  threeDDirectionRef?: { artifactId: string; version: number };
  frontPackRef?: { artifactId: string; version: number };
  completePackRef?: { artifactId: string; version: number };
  viewsRef?: { artifactId: string; version: number };
};

/**
 * Exact-version dependency checks for Packaging artifacts.
 */
export function runPackagingDependencyChecks(
  obs: ArtifactObservation,
  expected?: PackagingExpectedRefs,
): CdfValidationCheck[] {
  const out: CdfValidationCheck[] = [];
  const key = obs.artifactKey;
  if (!(key in PACKAGING_DEPENDENCY_GRAPH)) return out;

  const required = PACKAGING_DEPENDENCY_GRAPH[
    key as keyof typeof PACKAGING_DEPENDENCY_GRAPH
  ];

  const map: Record<string, { actual?: { artifactId: string; version: number }; expected?: { artifactId: string; version: number }; label: string }> = {
    [PACKAGING_ARTIFACT_KEYS.dieline]: {
      actual: obs.packagingRefs?.dieline,
      expected: expected?.dielineRef,
      label: "dielineRef",
    },
    [PACKAGING_ARTIFACT_KEYS.routes]: {
      actual: obs.packagingRefs?.routes,
      expected: expected?.routesRef,
      label: "routesRef",
    },
    [PACKAGING_ARTIFACT_KEYS.threeDDirection]: {
      actual: obs.packagingRefs?.threeDDirection,
      expected: expected?.threeDDirectionRef,
      label: "threeDDirectionRef",
    },
    [PACKAGING_ARTIFACT_KEYS.frontPack]: {
      actual: obs.packagingRefs?.frontPack,
      expected: expected?.frontPackRef,
      label: "frontPackRef",
    },
    [PACKAGING_ARTIFACT_KEYS.completePack]: {
      actual: obs.packagingRefs?.completePack,
      expected: expected?.completePackRef,
      label: "completePackRef",
    },
    [PACKAGING_ARTIFACT_KEYS.views]: {
      actual: obs.packagingRefs?.views,
      expected: expected?.viewsRef,
      label: "viewsRef",
    },
  };

  for (const depKey of required) {
    const entry = map[depKey];
    if (!entry) continue;
    // Schema-required deps always need an actual pin on the candidate.
    const requiredOnCandidate =
      key === PACKAGING_ARTIFACT_KEYS.threeDDirection ||
      key === PACKAGING_ARTIFACT_KEYS.frontPack ||
      key === PACKAGING_ARTIFACT_KEYS.completePack ||
      key === PACKAGING_ARTIFACT_KEYS.views ||
      key === PACKAGING_ARTIFACT_KEYS.skuAdaptations;
    out.push(
      checkExactRef(
        entry.label,
        entry.actual,
        entry.expected,
        requiredOnCandidate,
      ),
    );
  }

  // Optional dieline on front-pack
  if (key === PACKAGING_ARTIFACT_KEYS.frontPack && expected?.dielineRef) {
    out.push(
      checkExactRef(
        "dielineRef",
        obs.packagingRefs?.dieline,
        expected.dielineRef,
        true,
      ),
    );
  }

  return out;
}
