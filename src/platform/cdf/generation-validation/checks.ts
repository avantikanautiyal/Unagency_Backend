/**
 * Deterministic requirement checks against artifact observations (M4).
 * Never mutates artifacts. Never invents creative content.
 */

import type { CdfRequirement } from "../requirements/types";
import { classifyRequirement } from "./classify";
import type {
  ArtifactObservation,
  CdfValidationCheck,
  CdfVerificationType,
} from "./types";

let checkSeq = 0;

export function resetValidationCheckIdsForTests(): void {
  checkSeq = 0;
}

function nextCheckId(key: string): string {
  checkSeq += 1;
  return `vchk_${checkSeq}_${key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40)}`;
}

function base(
  req: CdfRequirement,
  partial: Omit<
    CdfValidationCheck,
    "checkId" | "requirementId" | "requirementKey" | "category"
  >,
): CdfValidationCheck {
  return {
    checkId: nextCheckId(req.key),
    requirementId: req.requirementId,
    requirementKey: req.key,
    category: req.category,
    ...partial,
  };
}

function parseAspect(ratio: string): number | null {
  const m = ratio.trim().match(/^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return null;
  return w / h;
}

export function runRequirementCheck(
  req: CdfRequirement,
  obs: ArtifactObservation,
  opts?: {
    expectedDesignSystemRef?: { artifactId: string; version: number };
    expectedDesignRouteRef?: { artifactId: string; version: number };
  },
): CdfValidationCheck {
  const { capability, verificationType } = classifyRequirement(req);

  if (capability === "semantic_review_required") {
    return base(req, {
      verificationType,
      capability,
      fieldPath: req.key,
      expected: req.displayValue,
      actual: null,
      status: "semantic_review_required",
      severity: "informational",
      evidence: `Requirement "${req.key}" requires semantic/human review; not marked deterministic PASS.`,
    });
  }

  if (capability === "unable_to_verify" && verificationType === "semantic_manual_review") {
    return base(req, {
      verificationType,
      capability,
      fieldPath: req.key,
      expected: req.displayValue,
      actual: null,
      status: "unable_to_verify",
      severity: "informational",
      evidence: `No deterministic verifier for "${req.key}".`,
    });
  }

  // Count / slide_count / route_count / sku_count
  if (
    verificationType === "count" ||
    req.key === "slide_count" ||
    req.key === "route_count" ||
    req.key === "design_route_count" ||
    req.key === "sku_count" ||
    req.key.includes("sku_count")
  ) {
    return checkCount(req, obs, verificationType);
  }

  if (req.key === "package_type" || req.key === "pack_format") {
    if (!obs.packageType) {
      return base(req, {
        verificationType: "exact_match",
        capability: "unable_to_verify",
        fieldPath: "packageType",
        expected: req.displayValue,
        actual: null,
        status: "unable_to_verify",
        severity: "blocking",
        evidence: "packageType not observable on this artifact.",
      });
    }
    const needle = req.displayValue.toLowerCase();
    const passed = obs.packageType.toLowerCase().includes(needle);
    return base(req, {
      verificationType: "exact_match",
      capability: "machine_verifiable",
      fieldPath: "packageType",
      expected: req.displayValue,
      actual: obs.packageType,
      status: passed ? "pass" : "fail",
      severity: "blocking",
      evidence: passed
        ? `packageType matches "${req.displayValue}".`
        : `Expected packageType "${req.displayValue}", got "${obs.packageType}".`,
    });
  }

  if (verificationType === "dimensions" || req.key === "dimensions") {
    return checkDimensions(req, obs);
  }

  if (verificationType === "aspect_ratio" || req.key === "aspect_ratio") {
    return checkAspectRatio(req, obs);
  }

  if (
    verificationType === "exact_match" ||
    req.key === "exact_headline" ||
    req.key === "exact_wording" ||
    req.key === "headline.exact"
  ) {
    return checkExactWording(req, obs);
  }

  if (verificationType === "not_contains" || req.category === "forbidden_content") {
    return checkForbidden(req, obs);
  }

  if (
    verificationType === "structural_presence" ||
    req.key === "mandatory_sections" ||
    req.category === "mandatory_content"
  ) {
    return checkMandatory(req, obs);
  }

  if (
    req.key === "primary_background" ||
    req.key === "text_color" ||
    req.key === "accent_color" ||
    req.key === "brand_colors" ||
    req.category === "color"
  ) {
    return checkColor(req, obs);
  }

  if (req.key === "required_logo") {
    const passed = Boolean(obs.hasLogoAsset) || obs.vaultAssetIds.length > 0;
    return base(req, {
      verificationType: "structural_presence",
      capability: obs.hasLogoAsset ? "machine_verifiable" : "unable_to_verify",
      fieldPath: "vaultAssetIds/logo",
      expected: true,
      actual: obs.hasLogoAsset,
      status: obs.hasLogoAsset
        ? "pass"
        : obs.vaultAssetIds.length
          ? "unable_to_verify"
          : "fail",
      severity: obs.hasLogoAsset ? "informational" : "blocking",
      evidence: obs.hasLogoAsset
        ? "Logo-tagged vault asset present."
        : obs.vaultAssetIds.length
          ? "Assets present but logo role not structurally confirmed."
          : "No logo/asset reference found.",
    });
  }

  // Dependency pins via explicit expected refs (not from requirement key alone)
  if (
    req.key.startsWith("dependency.design_system") &&
    opts?.expectedDesignSystemRef
  ) {
    return checkDesignSystemDep(req, obs, opts.expectedDesignSystemRef);
  }

  return base(req, {
    verificationType,
    capability: "unable_to_verify",
    fieldPath: req.key,
    expected: req.displayValue,
    actual: null,
    status: "unable_to_verify",
    severity: "informational",
    evidence: `No deterministic checker mapped for "${req.key}".`,
  });
}

function checkCount(
  req: CdfRequirement,
  obs: ArtifactObservation,
  verificationType: CdfVerificationType,
): CdfValidationCheck {
  const actual =
    req.key.includes("sku")
      ? obs.skuCount
      : req.key.includes("route")
        ? obs.routeCount
        : obs.slideCount;

  if (req.value.kind === "range") {
    if (actual == null) {
      return base(req, {
        verificationType: "numeric_range",
        capability: "unable_to_verify",
        fieldPath: req.key.includes("sku")
          ? "skuCount"
          : req.key.includes("route")
            ? "routeCount"
            : "slideCount",
        expected: req.value.value,
        actual: null,
        status: "unable_to_verify",
        severity: "blocking",
        evidence: "Count not observable on this artifact type.",
      });
    }
    const { min, max } = req.value.value;
    const passed = actual >= min && actual <= max;
    return base(req, {
      verificationType: "numeric_range",
      capability: "machine_verifiable",
      fieldPath: req.key.includes("sku")
        ? "skuCount"
        : req.key.includes("route")
          ? "routeCount"
          : "slideCount",
      expected: { min, max },
      actual,
      status: passed ? "pass" : "fail",
      severity: "blocking",
      evidence: passed
        ? `Count ${actual} within [${min}, ${max}].`
        : `Count ${actual} outside [${min}, ${max}].`,
    });
  }

  const expected =
    req.value.kind === "number" ? req.value.value : Number(req.displayValue);
  if (!Number.isFinite(expected)) {
    return base(req, {
      verificationType,
      capability: "unable_to_verify",
      fieldPath: "count",
      expected: req.displayValue,
      actual,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "Expected count is not numeric.",
    });
  }
  if (actual == null) {
    return base(req, {
      verificationType: "count",
      capability: "unable_to_verify",
      fieldPath: "count",
      expected,
      actual: null,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "Count not observable on this artifact.",
    });
  }
  const passed = actual === expected;
  return base(req, {
    verificationType: "count",
    capability: "machine_verifiable",
    fieldPath: req.key.includes("sku")
      ? "skuCount"
      : req.key.includes("route")
        ? "routeCount"
        : "slideCount",
    expected,
    actual,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? `Count equals ${expected}.`
      : `Expected ${expected}, got ${actual}.`,
  });
}

function checkDimensions(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  if (req.value.kind !== "dimension") {
    return base(req, {
      verificationType: "dimensions",
      capability: "unable_to_verify",
      fieldPath: "dimensions",
      expected: req.displayValue,
      actual: obs.dimensions ?? null,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "Requirement is not a structured dimension value.",
    });
  }
  if (!obs.dimensions) {
    // Packaging physical mm (M8C) when canvas dimensions absent
    if (obs.physicalDimensionsMm && req.value.kind === "dimension") {
      const { width, height } = req.value.value;
      const passed =
        obs.physicalDimensionsMm.widthMm === width &&
        obs.physicalDimensionsMm.heightMm === height;
      return base(req, {
        verificationType: "dimensions",
        capability: "machine_verifiable",
        fieldPath: "dimensions.mm",
        expected: req.value.value,
        actual: obs.physicalDimensionsMm,
        status: passed ? "pass" : "fail",
        severity: "blocking",
        evidence: passed
          ? "Physical mm dimensions match requirement."
          : `Expected ${width}x${height}mm, got ${obs.physicalDimensionsMm.widthMm}x${obs.physicalDimensionsMm.heightMm}mm.`,
      });
    }
    return base(req, {
      verificationType: "dimensions",
      capability: "unable_to_verify",
      fieldPath: "metadata.dimensions",
      expected: req.value.value,
      actual: null,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "Artifact has no observable dimensions.",
    });
  }
  // Compare against logical canvas when unit is px and matches width/height units,
  // or compare aspect when only ratio implied.
  const { width, height } = req.value.value;
  const passed =
    obs.dimensions.widthUnits === width &&
    obs.dimensions.heightUnits === height;
  // Also accept aspect-equivalent when canvas is 16:9 and req is 1920x1080
  const aspectPass =
    Math.abs(obs.dimensions.widthUnits / obs.dimensions.heightUnits - width / height) <
    0.02;
  const ok = passed || aspectPass;
  return base(req, {
    verificationType: "dimensions",
    capability: "machine_verifiable",
    fieldPath: "metadata.dimensions",
    expected: req.value.value,
    actual: obs.dimensions,
    status: ok ? "pass" : "fail",
    severity: "blocking",
    evidence: ok
      ? "Dimensions/aspect match requirement."
      : `Expected ${width}x${height}, got ${obs.dimensions.widthUnits}x${obs.dimensions.heightUnits} (${obs.dimensions.aspectRatio}).`,
  });
}

function checkAspectRatio(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  const expectedStr =
    req.value.kind === "string" || req.value.kind === "enum"
      ? req.value.value
      : req.displayValue;
  const expected = parseAspect(expectedStr);
  const actualStr = obs.aspectRatio || "";
  const actual = parseAspect(actualStr);
  if (expected == null || actual == null) {
    return base(req, {
      verificationType: "aspect_ratio",
      capability: "unable_to_verify",
      fieldPath: "aspectRatio",
      expected: expectedStr,
      actual: actualStr || null,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "Could not parse aspect ratio.",
    });
  }
  const passed = Math.abs(expected - actual) < 0.02;
  return base(req, {
    verificationType: "aspect_ratio",
    capability: "machine_verifiable",
    fieldPath: "aspectRatio",
    expected: expectedStr,
    actual: actualStr,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? `Aspect ratio ${actualStr} matches.`
      : `Expected ${expectedStr}, got ${actualStr}.`,
  });
}

function checkExactWording(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  const expected =
    req.value.kind === "string" ? req.value.value : req.displayValue;
  // Exact: must appear as a full headline/title equality — not contains
  const passed = obs.exactHeadlines.some((h) => h === expected);
  return base(req, {
    verificationType: "exact_match",
    capability: "machine_verifiable",
    fieldPath: "exactHeadlines",
    expected,
    actual: obs.exactHeadlines,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? `Exact wording "${expected}" found.`
      : `Exact wording "${expected}" not found among headlines ${JSON.stringify(obs.exactHeadlines)}.`,
  });
}

function checkForbidden(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  const needle = req.displayValue.toLowerCase();
  const present = obs.textCorpus.toLowerCase().includes(needle);
  // Color forbids
  if (req.key.startsWith("forbidden.color.")) {
    const colorNeedle = req.key.replace("forbidden.color.", "");
    const colorHit = obs.colors.some((c) =>
      c.toLowerCase().includes(colorNeedle),
    ) || obs.colorKeys.some((k) => k.toLowerCase().includes(colorNeedle));
    const fail = colorHit || present;
    return base(req, {
      verificationType: "not_contains",
      capability: "machine_verifiable",
      fieldPath: "colors/text",
      expected: { forbidden: req.displayValue },
      actual: fail ? req.displayValue : null,
      status: fail ? "fail" : "pass",
      severity: "blocking",
      evidence: fail
        ? `Forbidden color/content "${req.displayValue}" present.`
        : `Forbidden color "${req.displayValue}" absent.`,
    });
  }
  return base(req, {
    verificationType: "not_contains",
    capability: "machine_verifiable",
    fieldPath: "textCorpus",
    expected: { forbidden: req.displayValue },
    actual: present ? req.displayValue : null,
    status: present ? "fail" : "pass",
    severity: "blocking",
    evidence: present
      ? `Forbidden content present: ${req.displayValue}`
      : `Exclusion "${req.displayValue}" respected.`,
  });
}

function checkMandatory(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  if (req.value.kind === "string[]") {
    const missing = req.value.value.filter((sec) => {
      const n = sec.toLowerCase();
      return !(
        obs.sectionTitles.some((t) => t.toLowerCase().includes(n)) ||
        obs.titles.some((t) => t.toLowerCase().includes(n)) ||
        obs.textCorpus.toLowerCase().includes(n) ||
        obs.sectionIds.some((id) => id.toLowerCase().includes(n))
      );
    });
    const passed = missing.length === 0;
    return base(req, {
      verificationType: "structural_presence",
      capability: "machine_verifiable",
      fieldPath: "sections/titles",
      expected: req.value.value,
      actual: { missing },
      status: passed ? "pass" : "fail",
      severity: "blocking",
      evidence: passed
        ? "All mandatory sections present."
        : `Missing mandatory sections: ${missing.join(", ")}`,
    });
  }
  const needle = req.displayValue.toLowerCase();
  const passed =
    obs.textCorpus.toLowerCase().includes(needle) ||
    obs.titles.some((t) => t.toLowerCase().includes(needle));
  return base(req, {
    verificationType: "structural_presence",
    capability: "machine_verifiable",
    fieldPath: "textCorpus",
    expected: req.displayValue,
    actual: passed ? req.displayValue : null,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? `Required content "${req.displayValue}" present.`
      : `Required content "${req.displayValue}" missing.`,
  });
}

function checkColor(
  req: CdfRequirement,
  obs: ArtifactObservation,
): CdfValidationCheck {
  if (!obs.colors.length && !obs.colorKeys.length) {
    return base(req, {
      verificationType: "contains",
      capability: "unable_to_verify",
      fieldPath: "colors",
      expected: req.displayValue,
      actual: null,
      status: "unable_to_verify",
      severity: "blocking",
      evidence: "No colors observable on this artifact (e.g. not a design-system).",
    });
  }
  const needle = req.displayValue.toLowerCase();
  const passed =
    obs.colors.some(
      (c) =>
        c.toLowerCase().includes(needle) ||
        needle.includes(c.toLowerCase()),
    ) ||
    obs.colorKeys.some((k) => k.toLowerCase().includes(needle));
  return base(req, {
    verificationType: "contains",
    capability: "machine_verifiable",
    fieldPath: "colors",
    expected: req.displayValue,
    actual: obs.colors,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? `Color requirement "${req.displayValue}" satisfied.`
      : `Missing required color "${req.displayValue}".`,
  });
}

function checkDesignSystemDep(
  req: CdfRequirement,
  obs: ArtifactObservation,
  expected: { artifactId: string; version: number },
): CdfValidationCheck {
  const actual = obs.designSystemRef;
  const passed =
    actual?.artifactId === expected.artifactId &&
    actual?.version === expected.version;
  return base(req, {
    verificationType: "reference_match",
    capability: "machine_verifiable",
    fieldPath: "designSystemRef",
    expected,
    actual: actual ?? null,
    status: passed ? "pass" : "fail",
    severity: "blocking",
    evidence: passed
      ? "designSystemRef matches exact expected version."
      : `Expected designSystem ${expected.artifactId}@${expected.version}, got ${
          actual ? `${actual.artifactId}@${actual.version}` : "missing"
        }.`,
  });
}

export function runDependencyChecks(
  obs: ArtifactObservation,
  opts: {
    expectedDesignSystemRef?: { artifactId: string; version: number };
    expectedDesignRouteRef?: { artifactId: string; version: number };
  },
): CdfValidationCheck[] {
  const out: CdfValidationCheck[] = [];
  if (opts.expectedDesignSystemRef && obs.artifactKey.includes("deck")) {
    const fakeReq = {
      requirementId: "dep.design_system",
      key: "dependency.design_system",
      category: "reference",
      displayValue: `${opts.expectedDesignSystemRef.artifactId}@${opts.expectedDesignSystemRef.version}`,
      value: { kind: "object" as const, value: opts.expectedDesignSystemRef },
    } as unknown as CdfRequirement;
    out.push(
      checkDesignSystemDep(fakeReq, obs, opts.expectedDesignSystemRef),
    );
  }
  if (opts.expectedDesignRouteRef && obs.derivedFromRoute) {
    const passed =
      obs.derivedFromRoute.artifactId === opts.expectedDesignRouteRef.artifactId &&
      obs.derivedFromRoute.version === opts.expectedDesignRouteRef.version;
    out.push({
      checkId: nextCheckId("dependency.design_route"),
      requirementKey: "dependency.design_route",
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: "derivedFromRoute",
      expected: opts.expectedDesignRouteRef,
      actual: obs.derivedFromRoute,
      status: passed ? "pass" : "fail",
      severity: "blocking",
      evidence: passed
        ? "derivedFromRoute matches exact design-route version."
        : `Expected route ${opts.expectedDesignRouteRef.artifactId}@${opts.expectedDesignRouteRef.version}, got ${obs.derivedFromRoute.artifactId}@${obs.derivedFromRoute.version}.`,
    });
  } else if (
    opts.expectedDesignRouteRef &&
    obs.artifactKey.includes("design-system")
  ) {
    out.push({
      checkId: nextCheckId("dependency.design_route"),
      requirementKey: "dependency.design_route",
      category: "reference",
      verificationType: "reference_match",
      capability: "machine_verifiable",
      fieldPath: "derivedFromRoute",
      expected: opts.expectedDesignRouteRef,
      actual: null,
      status: "fail",
      severity: "blocking",
      evidence: "design-system missing derivedFromRoute dependency.",
    });
  }
  return out;
}
