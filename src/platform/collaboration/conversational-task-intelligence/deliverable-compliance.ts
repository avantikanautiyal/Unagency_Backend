/**
 * Priority 4.6 — Deliverable compliance validation (extends Step 2 / Evaluation Plane).
 * Phase B — Format & Production Spec release authority + canvas enforcement.
 */

import type { ContractRequirement } from "../../os/contracts/output-contracts/evaluation-methods";
import type {
  CanonicalExecutionSpecification,
  DeliverableFormat,
  NegativeConstraintSpec,
} from "./execution-specification";
import {
  constraintObservabilitySummary,
  formatNegativeConstraintForProvider,
} from "./requirement-enforcement";
import {
  evaluateVisualNegativeConstraint,
  mapVisualRequirementToComplianceStatus,
} from "./visual-requirement-evaluator";
import {
  dimensionsAreHardConstraint,
  evaluateProductionComplianceChecks,
  isHardComplianceFailure,
  type ProductionComplianceContext,
} from "./production-compliance";

export type { ProductionComplianceContext };

export type ComplianceMeasurementMethod =
  | "MEASURED"
  | "HEURISTIC"
  | "MODEL_JUDGED"
  | "NOT_AUTOMATED";

export type DeliverableComplianceResult = {
  readonly checkId: string;
  readonly status: "PASS" | "FAIL" | "NOT_AUTOMATED";
  readonly method: ComplianceMeasurementMethod;
  readonly evidence: readonly string[];
  readonly evaluationMode?: ComplianceMeasurementMethod;
  readonly evaluatorProvenance?: Readonly<Record<string, string>>;
  /** Soft Spec D canvas drift — FAIL for observability, does not hard-block. */
  readonly softFailure?: boolean;
};

export type RequirementComplianceStatus =
  | "COMPLIANT"
  | "REQUIREMENT_COMPLIANCE_FAILURE"
  | "NOT_EVALUATED";

export type DeliverableComplianceReport = {
  readonly planeVersion: typeof import("./execution-specification").EXECUTION_RESOLUTION_PLANE_VERSION;
  readonly overallStatus: "COMPLIANT" | "DELIVERABLE_COMPLIANCE_FAILURE" | "NOT_EVALUATED";
  readonly requirementComplianceStatus: RequirementComplianceStatus;
  readonly results: readonly DeliverableComplianceResult[];
  readonly productionReleaseBlocked?: boolean;
  readonly productionReleaseReasons?: readonly string[];
  /** Hygiene Reference PASS / REVISE / REVIEW / HOLD. */
  readonly productionReleaseDecision?: import("../../config/format-production-spec").ProductionReleaseDecision;
};

export function userTaskRequirementsFromExecutionSpec(
  spec: CanonicalExecutionSpecification,
  production?: ProductionComplianceContext,
): readonly ContractRequirement[] {
  const reqs: ContractRequirement[] = [];

  if (spec.task.objective?.value) {
    reqs.push({
      id: "user_task.brief_objective",
      class: "hard",
      category: "user_task",
      description: "Output must satisfy the resolved user objective",
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: spec.task.objective.value,
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  for (const d of spec.deliverables) {
    reqs.push({
      id: `user_task.deliverable.${d.format.toLowerCase()}`,
      class: "hard",
      category: "deliverable",
      description: `Required deliverable: ${d.format}`,
      evaluation: {
        method: "artifact_inspection",
        expectedResult: `${d.format} artifact present`,
        severity: "critical",
        blocksCompletion: true,
      },
    });
  }

  if (spec.content.quantity?.value !== undefined) {
    reqs.push({
      id: "user_task.content.quantity",
      class: "hard",
      category: "content",
      description: `Requested quantity: ${spec.content.quantity.value}`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: `exactly ${spec.content.quantity.value} items`,
        severity: "high",
        blocksCompletion: true,
      },
    });
  }

  if (spec.outputIntent.mode.value === "FINAL") {
    reqs.push({
      id: "user_task.output.final_mode",
      class: "hard",
      category: "content",
      description: "User requested one final result — no alternative directions",
      evaluation: {
        method: "deterministic_validation",
        expectedResult: "single final output, no multiple directions",
        severity: "high",
        blocksCompletion: true,
      },
    });
  }

  if (spec.technical.width?.value && spec.technical.height?.value) {
    const hardDims = dimensionsAreHardConstraint(spec, production);
    reqs.push({
      id: "user_task.technical.dimensions",
      class: "hard",
      category: "technical",
      description: `Canvas dimensions: ${spec.technical.width.value}×${spec.technical.height.value}px`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: `${spec.technical.width.value}x${spec.technical.height.value}`,
        severity: hardDims ? "critical" : "high",
        blocksCompletion: hardDims,
      },
    });
  }

  if (spec.technical.pageCount?.value !== undefined) {
    reqs.push({
      id: "user_task.technical.page_count",
      class: "hard",
      category: "technical",
      description: `Page count: ${spec.technical.pageCount.value}`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: `${spec.technical.pageCount.value} page(s)`,
        severity: "medium",
        blocksCompletion: false,
      },
    });
  }

  if (spec.content.ctaRequired?.value === false) {
    reqs.push({
      id: "user_task.content.no_cta",
      class: "hard",
      category: "content",
      description: "User requested no CTA",
      evaluation: {
        method: "deterministic_validation",
        expectedResult: "no call-to-action present",
        severity: "medium",
        blocksCompletion: false,
      },
    });
  }

  if (spec.outputIntent.rationaleSentenceCount?.value) {
    reqs.push({
      id: "user_task.content.rationale_sentences",
      class: "hard",
      category: "content",
      description: `Rationale in ${spec.outputIntent.rationaleSentenceCount.value} sentences`,
      evaluation: {
        method: "semantic_evaluator",
        expectedResult: `${spec.outputIntent.rationaleSentenceCount.value} sentence rationale`,
        severity: "medium",
        blocksCompletion: false,
      },
    });
  }

  for (const item of spec.content.contentItems ?? []) {
    reqs.push({
      id: `user_task.content.${item.value.role}`,
      class: "hard",
      category: "content",
      description: `${item.value.quantity} ${item.value.role}(s)${item.value.wordCount ? `, ${item.value.wordCount} words each` : ""}`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: `${item.value.quantity} ${item.value.role}`,
        severity: "high",
        blocksCompletion: true,
      },
    });
  }

  for (const neg of spec.creative.negativeConstraints ?? []) {
    if (neg.value.enforcement !== "HARD_CONSTRAINT") continue;
    reqs.push({
      id: `user_task.negative.${neg.value.normalizedConcept}`,
      class: "hard",
      category: "creative",
      description: `Hard constraint — do not include: ${neg.value.subject}`,
      evaluation: {
        method: complianceMethodForNegative(neg.value),
        expectedResult: `absence of ${neg.value.subject}`,
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  for (const asset of spec.brandAssets?.requirements ?? []) {
    if (!asset.value.required) continue;
    reqs.push({
      id: `user_task.brand_asset.${asset.value.role}`,
      class: "hard",
      category: "brand",
      description: `Required brand ${asset.value.role} asset must be used`,
      evaluation: {
        method: asset.value.assetId ? "deterministic_validation" : "not_yet_automated",
        expectedResult: asset.value.assetId
          ? `brand asset ${asset.value.assetId} attached and used`
          : "brand vault asset used",
        severity: "high",
        blocksCompletion: false,
      },
    });
  }

  const logo = spec.referenceAssets?.logo?.value;
  if (logo?.mode === "USE_EXISTING" && logo.assetId) {
    reqs.push({
      id: "user_task.authoritative_logo",
      class: "hard",
      category: "brand",
      description: `Authoritative logo ${logo.assetId} must be used exactly`,
      evaluation: {
        method: "deterministic_validation",
        expectedResult: `authoritative logo ${logo.assetId} attached to execution`,
        severity: "critical",
        blocksCompletion: true,
      },
    });
  }

  const releasePreview = evaluateProductionComplianceChecks({
    spec,
    production,
  });
  if (
    releasePreview.gate.rule &&
    (releasePreview.gate.rule.status === "R" ||
      releasePreview.gate.rule.status === "H")
  ) {
    reqs.push({
      id: "user_task.production.release_authority",
      class: "hard",
      category: "format",
      description: `Placement ${releasePreview.gate.rule.id} status ${releasePreview.gate.rule.status} requires confirmation before release`,
      evaluation: {
        method: "human_approval",
        expectedResult: "confirmed_override_or_verified_spec",
        severity: "critical",
        blocksCompletion: true,
      },
    });
  }

  return Object.freeze(reqs);
}

function complianceMethodForNegative(
  constraint: NegativeConstraintSpec,
): ContractRequirement["evaluation"]["method"] {
  const concept = constraint.normalizedConcept;
  if (concept.includes("cta")) return "deterministic_validation";
  if (concept.includes("leaf")) return "not_yet_automated";
  if (/\b(green|red|blue|gradient|serif|rounded)\b/.test(concept)) {
    return "deterministic_validation";
  }
  return "not_yet_automated";
}

export function evaluateDeliverableCompliance(input: {
  readonly spec?: CanonicalExecutionSpecification;
  readonly presentFormats?: readonly DeliverableFormat[];
  readonly generatedQuantity?: number;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly generatedPageCount?: number;
  readonly previewContainsCta?: boolean;
  readonly previewText?: string;
  readonly attachedBrandAssetIds?: readonly string[];
  readonly imageArtifactBytes?: Buffer;
  readonly imageArtifactMimeType?: string;
  readonly production?: ProductionComplianceContext;
}): DeliverableComplianceReport {
  const spec = input.spec;
  if (!spec) {
    return Object.freeze({
      planeVersion: "p4.6.0" as const,
      overallStatus: "NOT_EVALUATED",
      requirementComplianceStatus: "NOT_EVALUATED",
      results: Object.freeze([]),
    });
  }

  const results: DeliverableComplianceResult[] = [];
  const present = new Set(input.presentFormats ?? []);

  const explicitDeliverables = spec.deliverables.filter((d) => d.provenance.explicit);
  const deliverablesToCheck =
    explicitDeliverables.length > 0 ? explicitDeliverables : spec.deliverables;

  for (const d of deliverablesToCheck) {
    const pass = present.has(d.format);
    results.push(
      Object.freeze({
        checkId: `deliverable.${d.format}`,
        status: pass ? "PASS" : "FAIL",
        method: "MEASURED",
        evidence: Object.freeze([
          pass
            ? `${d.format} artifact present`
            : `MISSING_REQUIRED_DELIVERABLE: ${d.format}`,
        ]),
      }),
    );
  }

  if (spec.content.quantity?.value !== undefined && input.generatedQuantity !== undefined) {
    const pass = input.generatedQuantity === spec.content.quantity.value;
    results.push(
      Object.freeze({
        checkId: "content.quantity",
        status: pass ? "PASS" : "FAIL",
        method: "MEASURED",
        evidence: Object.freeze([
          pass
            ? `quantity ${input.generatedQuantity} matches requested ${spec.content.quantity.value}`
            : `DELIVERABLE_COMPLIANCE_FAILURE: requested ${spec.content.quantity.value}, generated ${input.generatedQuantity}`,
        ]),
      }),
    );
  }

  const productionEval = evaluateProductionComplianceChecks({
    spec,
    production: input.production,
    generatedWidth: input.generatedWidth,
    generatedHeight: input.generatedHeight,
  });
  for (const check of productionEval.results) {
    results.push(Object.freeze({ ...check }));
  }

  const gateCoveredCanvas = productionEval.results.some(
    (r) => r.checkId === "production.canvas_dimensions",
  );
  if (
    !gateCoveredCanvas &&
    spec.technical.width?.value &&
    spec.technical.height?.value &&
    input.generatedWidth !== undefined &&
    input.generatedHeight !== undefined
  ) {
    const pass =
      input.generatedWidth === spec.technical.width.value &&
      input.generatedHeight === spec.technical.height.value;
    const hard = dimensionsAreHardConstraint(spec, input.production);
    results.push(
      Object.freeze({
        checkId: "technical.dimensions",
        status: pass ? "PASS" : "FAIL",
        method: "MEASURED",
        ...(pass || hard ? {} : { softFailure: true as const }),
        evidence: Object.freeze([
          pass
            ? `dimensions ${input.generatedWidth}×${input.generatedHeight} match`
            : `TECHNICAL_REQUIREMENT_FAILURE: requested ${spec.technical.width.value}×${spec.technical.height.value}, got ${input.generatedWidth}×${input.generatedHeight}`,
        ]),
      }),
    );
  }

  if (spec.content.ctaRequired?.value === false && input.previewContainsCta !== undefined) {
    results.push(
      Object.freeze({
        checkId: "content.no_cta",
        status: input.previewContainsCta ? "FAIL" : "PASS",
        method: "HEURISTIC",
        evidence: Object.freeze([
          input.previewContainsCta ? "CTA detected when user requested none" : "No CTA detected",
        ]),
      }),
    );
  }

  const previewLower = (input.previewText ?? "").toLowerCase();
  const hasImageArtifact = Boolean(input.imageArtifactBytes?.length);
  for (const neg of spec.creative.negativeConstraints ?? []) {
    if (neg.value.enforcement !== "HARD_CONSTRAINT") continue;
    const concept = neg.value.normalizedConcept;
    let status: DeliverableComplianceResult["status"] = "NOT_AUTOMATED";
    let method: ComplianceMeasurementMethod = "NOT_AUTOMATED";
    const evidence: string[] = [];
    let evaluationMode: ComplianceMeasurementMethod | undefined;
    let evaluatorProvenance: Readonly<Record<string, string>> | undefined;

    if (hasImageArtifact && (concept.includes("leaf") || concept.includes("recycling"))) {
      method = "NOT_AUTOMATED";
      evaluationMode = "NOT_AUTOMATED";
      evidence.push(
        `Visual constraint '${neg.value.subject}' on image artifact requires model-judged evaluation (no fake detector)`,
      );
    } else if (concept.includes("leaf") && previewLower) {
      const leafMention = /\bleaf\b|\bleaves\b|\bfoliage\b/i.test(previewLower);
      status = leafMention ? "FAIL" : "PASS";
      method = "HEURISTIC";
      evaluationMode = "HEURISTIC";
      evidence.push(
        leafMention
          ? `HARD_CONSTRAINT_VIOLATION: leaf reference detected in output metadata`
          : "No leaf reference detected in available output metadata",
      );
    } else if (concept.includes("green") && previewLower) {
      const greenMention = /\bgreen\b/i.test(previewLower);
      status = greenMention ? "FAIL" : "PASS";
      method = "HEURISTIC";
      evaluationMode = "HEURISTIC";
      evidence.push(
        greenMention
          ? "NEGATIVE_REQUIREMENT_FAILURE: green detected in output metadata"
          : "No green detected in available output metadata",
      );
    } else if (concept.includes("rounded") && previewLower) {
      const roundedMention = /\brounded\b/i.test(previewLower);
      status = roundedMention ? "FAIL" : "PASS";
      method = "HEURISTIC";
      evaluationMode = "HEURISTIC";
      evidence.push(
        roundedMention
          ? "NEGATIVE_REQUIREMENT_FAILURE: rounded cards mentioned in output metadata"
          : "No rounded-card reference in available output metadata",
      );
    } else {
      evidence.push(
        `Constraint preserved for generation; automated verification not available for: ${neg.value.subject}`,
      );
    }

    results.push(
      Object.freeze({
        checkId: `negative.${concept}`,
        status,
        method,
        evaluationMode,
        ...(evaluatorProvenance ? { evaluatorProvenance } : {}),
        evidence: Object.freeze(evidence),
      }),
    );
  }

  for (const asset of spec.brandAssets?.requirements ?? []) {
    if (!asset.value.required || !asset.value.assetId) continue;
    const attached = new Set(input.attachedBrandAssetIds ?? []);
    const pass = attached.has(asset.value.assetId);
    results.push(
      Object.freeze({
        checkId: `brand_asset.${asset.value.role}`,
        status: pass ? "PASS" : "FAIL",
        method: "MEASURED",
        evidence: Object.freeze([
          pass
            ? `Brand asset ${asset.value.assetId} attached to execution`
            : `BRAND_ASSET_REQUIREMENT_FAILURE: ${asset.value.assetId} not attached`,
        ]),
      }),
    );
  }

  const logo = spec.referenceAssets?.logo?.value;
  if (logo?.mode === "USE_EXISTING" && logo.assetId) {
    const attached = new Set(input.attachedBrandAssetIds ?? []);
    const pass = attached.has(logo.assetId);
    results.push(
      Object.freeze({
        checkId: "authoritative_logo.attached",
        status: pass ? "PASS" : "FAIL",
        method: "MEASURED",
        evidence: Object.freeze([
          pass
            ? `Authoritative logo ${logo.assetId} (${logo.source ?? "unknown"}) attached to execution`
            : `AUTHORITATIVE_LOGO_FAILURE: ${logo.assetId} not attached — silent substitution risk`,
        ]),
      }),
    );
    results.push(
      Object.freeze({
        checkId: "authoritative_logo.pixel_match",
        status: "NOT_AUTOMATED",
        method: "NOT_AUTOMATED",
        evidence: Object.freeze([
          "Exact logo pixel verification not automated for this modality; attachment presence verified only",
        ]),
      }),
    );
  }

  const failures = results.filter((r) => r.status === "FAIL");
  const hardFailures = failures.filter(isHardComplianceFailure);
  const hasNonSoftFailure = failures.some((r) => !r.softFailure);
  return Object.freeze({
    planeVersion: "p4.6.0" as const,
    overallStatus:
      results.length === 0
        ? "NOT_EVALUATED"
        : hasNonSoftFailure
          ? "DELIVERABLE_COMPLIANCE_FAILURE"
          : "COMPLIANT",
    requirementComplianceStatus:
      results.length === 0
        ? "NOT_EVALUATED"
        : hardFailures.length > 0
          ? "REQUIREMENT_COMPLIANCE_FAILURE"
          : "COMPLIANT",
    results: Object.freeze(results),
    productionReleaseBlocked: !productionEval.gate.allowed,
    productionReleaseDecision: productionEval.decision,
    ...(productionEval.gate.reasons.length
      ? { productionReleaseReasons: productionEval.gate.reasons }
      : {}),
  });
}

/** Async path — runs model-judged visual evaluators when registered. */
export async function evaluateDeliverableComplianceAsync(input: {
  readonly spec?: CanonicalExecutionSpecification;
  readonly presentFormats?: readonly DeliverableFormat[];
  readonly generatedQuantity?: number;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly generatedPageCount?: number;
  readonly previewContainsCta?: boolean;
  readonly previewText?: string;
  readonly attachedBrandAssetIds?: readonly string[];
  readonly imageArtifactBytes?: Buffer;
  readonly imageArtifactMimeType?: string;
  readonly production?: ProductionComplianceContext;
}): Promise<DeliverableComplianceReport> {
  const base = evaluateDeliverableCompliance(input);
  if (!input.spec || !input.imageArtifactBytes?.length) return base;

  const visualResults: DeliverableComplianceResult[] = [];
  for (const neg of input.spec.creative.negativeConstraints ?? []) {
    if (neg.value.enforcement !== "HARD_CONSTRAINT") continue;
    const visual = await evaluateVisualNegativeConstraint({
      constraint: neg.value,
      previewText: input.previewText,
      artifactBytes: input.imageArtifactBytes,
      mimeType: input.imageArtifactMimeType,
      requirementContext: input.spec.executionInstruction,
    });
    if (visual.evaluationMode === "NOT_AUTOMATED") continue;
    visualResults.push(
      Object.freeze({
        checkId: visual.requirementId,
        status: mapVisualRequirementToComplianceStatus(visual),
        method: visual.evaluationMode,
        evaluationMode: visual.evaluationMode,
        ...(visual.evaluatorProvenance
          ? {
              evaluatorProvenance: Object.freeze({
                evaluatorId: visual.evaluatorProvenance.evaluatorId,
                evaluatorVersion: visual.evaluatorProvenance.evaluatorVersion,
                evaluationPlaneVersion: visual.evaluatorProvenance.evaluationPlaneVersion,
                ...(visual.evaluatorProvenance.modelId
                  ? { modelId: visual.evaluatorProvenance.modelId }
                  : {}),
                ...(visual.evaluatorProvenance.providerId
                  ? { providerId: visual.evaluatorProvenance.providerId }
                  : {}),
              }),
            }
          : {}),
        evidence: visual.evidence,
      }),
    );
  }

  if (!visualResults.length) return base;

  const merged = [
    ...base.results.filter((r) => !r.checkId.startsWith("negative.")),
    ...visualResults,
  ];
  const failures = merged.filter((r) => r.status === "FAIL");
  const hardFailures = failures.filter(isHardComplianceFailure);
  const hasNonSoftFailure = failures.some((r) => !r.softFailure);
  return Object.freeze({
    ...base,
    results: Object.freeze(merged),
    overallStatus: hasNonSoftFailure
      ? "DELIVERABLE_COMPLIANCE_FAILURE"
      : "COMPLIANT",
    requirementComplianceStatus:
      hardFailures.length > 0 ? "REQUIREMENT_COMPLIANCE_FAILURE" : "COMPLIANT",
  });
}
