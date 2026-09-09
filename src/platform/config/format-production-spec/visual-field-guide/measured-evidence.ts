/**
 * Phase 6 C1 — Measured Visual Field Guide evidence from artifact dimensions.
 *
 * Produces failedGateHygieneIds / evidencedGateHygieneIds that feed
 * evaluateProductionReleaseGate. Does not invent vision judgments.
 */

import type { ProductionRule } from "../types";
import { getServiceVisualRecipe } from "./service-visual-recipes";

export type VisualFieldGuideMeasuredEvidence = {
  readonly failedGateHygieneIds: readonly string[];
  readonly evidencedGateHygieneIds: readonly string[];
  readonly checks: readonly {
    readonly id: string;
    readonly status: "PASS" | "FAIL" | "SKIP";
    readonly evidence: string;
  }[];
};

export type EvaluateVisualFieldGuideMeasuredInput = {
  readonly rule?: ProductionRule;
  readonly service?: string | null;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  /**
   * When true, D-authority canvas mismatch still records FAIL for technical
   * (release gate already WARN/blocks via dimensionsAreExplicit).
   */
  readonly treatDefaultMismatchAsFail?: boolean;
};

/**
 * Measure canvas / technical Field Guide expectations when pixel dims exist.
 * Universal gate id "technical" is evidenced when dims match Spec canvas.
 */
export function evaluateVisualFieldGuideMeasuredEvidence(
  input: EvaluateVisualFieldGuideMeasuredInput,
): VisualFieldGuideMeasuredEvidence {
  const failed: string[] = [];
  const evidenced: string[] = [];
  const checks: VisualFieldGuideMeasuredEvidence["checks"][number][] = [];

  const canvas = input.rule?.canvas;
  const w = input.generatedWidth;
  const h = input.generatedHeight;

  if (
    canvas &&
    canvas.unit === "px" &&
    typeof w === "number" &&
    typeof h === "number" &&
    Number.isFinite(w) &&
    Number.isFinite(h)
  ) {
    const match = w === canvas.width && h === canvas.height;
    const status = input.rule?.status;
    // V always hard-fails on mismatch; D only when dimensions were explicit.
    const hardFail =
      !match &&
      (status === "V" || input.treatDefaultMismatchAsFail === true);

    if (match) {
      evidenced.push("technical");
      checks.push({
        id: "technical",
        status: "PASS",
        evidence: `Measured ${w}×${h} matches Spec canvas ${canvas.width}×${canvas.height}`,
      });
      // Field Guide print dims-declared when service recipe uses MEASURED check.
      const recipe = getServiceVisualRecipe(
        input.service ?? input.rule?.service,
      );
      if (recipe) {
        for (const c of [...recipe.checkFirst, ...recipe.checkLast]) {
          if (c.evaluationMethod === "MEASURED" && c.weight === "gate") {
            evidenced.push(c.id);
            checks.push({
              id: c.id,
              status: "PASS",
              evidence: `Measured canvas satisfied for ${c.id}`,
            });
          }
        }
      }
    } else if (hardFail) {
      failed.push("technical");
      checks.push({
        id: "technical",
        status: "FAIL",
        evidence: `Measured ${w}×${h} ≠ Spec canvas ${canvas.width}×${canvas.height} (${status ?? "?"})`,
      });
    } else {
      checks.push({
        id: "technical",
        status: "SKIP",
        evidence: `Measured ${w}×${h} ≠ Spec ${canvas.width}×${canvas.height}; soft warn path`,
      });
    }
  } else {
    checks.push({
      id: "technical",
      status: "SKIP",
      evidence: "No measurable pixel dimensions for canvas check",
    });
  }

  return Object.freeze({
    failedGateHygieneIds: Object.freeze([...new Set(failed)]),
    evidencedGateHygieneIds: Object.freeze([...new Set(evidenced)]),
    checks: Object.freeze(checks),
  });
}

/**
 * Merge measured + optional caller/vision evidence arrays (dedupe; fail wins).
 */
export function mergeHygieneEvidenceIds(input: {
  readonly failed?: readonly string[];
  readonly evidenced?: readonly string[];
  readonly extraFailed?: readonly string[];
  readonly extraEvidenced?: readonly string[];
}): {
  readonly failedGateHygieneIds: readonly string[];
  readonly evidencedGateHygieneIds: readonly string[];
} {
  const failed = new Set<string>([
    ...(input.failed ?? []),
    ...(input.extraFailed ?? []),
  ]);
  const evidenced = new Set<string>();
  for (const id of [
    ...(input.evidenced ?? []),
    ...(input.extraEvidenced ?? []),
  ]) {
    if (!failed.has(id)) evidenced.add(id);
  }
  return Object.freeze({
    failedGateHygieneIds: Object.freeze([...failed]),
    evidencedGateHygieneIds: Object.freeze([...evidenced]),
  });
}
