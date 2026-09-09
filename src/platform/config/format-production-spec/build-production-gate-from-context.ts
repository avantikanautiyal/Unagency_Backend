/**
 * Build EvaluateProductionReleaseGateInput from execution/job metadata.
 * Used by live delivery authorize/create and auto-delivery-on-success.
 * Phase 6: merges measured / vision Field Guide evidence from metadata.
 */

import { readExecutionSpecFromMetadata } from "../../collaboration/conversational-task-intelligence/execution-spec-snapshot";
import type { EvaluateProductionReleaseGateInput } from "./production-release-gate";
import { resolveProductionRule } from "./resolve-production-rule";
import {
  evaluateVisualFieldGuideMeasuredEvidence,
  mergeHygieneEvidenceIds,
} from "./visual-field-guide";

function readString(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): string | undefined {
  const v = metadata?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function readNumber(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): number | undefined {
  const v = metadata?.[key];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function readBool(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean | undefined {
  const v = metadata?.[key];
  if (typeof v === "boolean") return v;
  return undefined;
}

function readStringArray(
  metadata: Readonly<Record<string, unknown>> | undefined,
  key: string,
): readonly string[] | undefined {
  const v = metadata?.[key];
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return out.length > 0 ? Object.freeze(out) : undefined;
}

export type BuildProductionGateOverrides = {
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly confirmedOverride?: boolean;
  readonly dimensionsAreExplicit?: boolean;
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly formatId?: string;
  readonly placementId?: string;
  readonly productionReleaseEligible?: boolean;
  readonly failedGateHygieneIds?: readonly string[];
  readonly evidencedGateHygieneIds?: readonly string[];
  readonly weightedExceptionIds?: readonly string[];
  readonly blockOnReview?: boolean;
  /** Skip auto measured Field Guide evidence (tests / callers that supply their own). */
  readonly skipMeasuredVisualFieldGuide?: boolean;
};

/**
 * Returns undefined when there is no Spec-relevant context (gate not applicable).
 */
export function buildProductionGateFromExecutionContext(
  metadata?: Readonly<Record<string, unknown>>,
  overrides?: BuildProductionGateOverrides,
): EvaluateProductionReleaseGateInput | undefined {
  const spec = readExecutionSpecFromMetadata(metadata);

  const service =
    overrides?.service ??
    readString(metadata, "service") ??
    spec?.task.service?.value;
  const subtype =
    overrides?.subtype ??
    readString(metadata, "subtype") ??
    spec?.task.subtype?.value;
  const platform =
    overrides?.platform ??
    readString(metadata, "platform") ??
    spec?.technical.platform?.value;
  const formatId =
    overrides?.formatId ??
    readString(metadata, "format") ??
    readString(metadata, "formatId");
  const placementId =
    overrides?.placementId ??
    readString(metadata, "placementId") ??
    readString(metadata, "productionPlacementId") ??
    readString(metadata, "productionRuleId");

  if (!service && !platform && !formatId && !placementId) {
    return undefined;
  }

  const generatedWidth =
    overrides?.generatedWidth ??
    readNumber(metadata, "generatedWidth") ??
    readNumber(metadata, "outputWidth") ??
    spec?.technical.width?.value;
  const generatedHeight =
    overrides?.generatedHeight ??
    readNumber(metadata, "generatedHeight") ??
    readNumber(metadata, "outputHeight") ??
    spec?.technical.height?.value;

  const dimensionsAreExplicit =
    overrides?.dimensionsAreExplicit ??
    (spec?.technical.width?.provenance.explicit === true &&
      spec?.technical.height?.provenance.explicit === true);

  const confirmedOverride =
    overrides?.confirmedOverride ??
    readBool(metadata, "productionConfirmedOverride") ??
    readBool(metadata, "confirmedOverride");

  const productionReleaseEligible =
    overrides?.productionReleaseEligible ??
    readBool(metadata, "productionReleaseEligible");

  const fromMetaFailed = readStringArray(metadata, "failedGateHygieneIds");
  const fromMetaEvidenced = readStringArray(
    metadata,
    "evidencedGateHygieneIds",
  );
  const fromMetaWeighted = readStringArray(metadata, "weightedExceptionIds");

  let failedGateHygieneIds =
    overrides?.failedGateHygieneIds ?? fromMetaFailed;
  let evidencedGateHygieneIds =
    overrides?.evidencedGateHygieneIds ?? fromMetaEvidenced;
  const weightedExceptionIds =
    overrides?.weightedExceptionIds ?? fromMetaWeighted;
  const blockOnReview =
    overrides?.blockOnReview ?? readBool(metadata, "productionBlockOnReview");

  // Phase 6 C1 — auto-measure canvas when dims present and caller did not skip.
  if (!overrides?.skipMeasuredVisualFieldGuide) {
    const resolved = resolveProductionRule({
      ...(service ? { service } : {}),
      ...(subtype ? { subtype } : {}),
      ...(platform ? { platform } : {}),
      ...(formatId ? { formatId } : {}),
      ...(placementId ? { placementId } : {}),
    });
    if (resolved) {
      const measured = evaluateVisualFieldGuideMeasuredEvidence({
        rule: resolved.rule,
        service,
        generatedWidth,
        generatedHeight,
        treatDefaultMismatchAsFail: dimensionsAreExplicit === true,
      });
      const merged = mergeHygieneEvidenceIds({
        failed: failedGateHygieneIds,
        evidenced: evidencedGateHygieneIds,
        extraFailed: measured.failedGateHygieneIds,
        extraEvidenced: measured.evidencedGateHygieneIds,
      });
      failedGateHygieneIds = merged.failedGateHygieneIds;
      evidencedGateHygieneIds = merged.evidencedGateHygieneIds;
    }
  }

  return Object.freeze({
    ...(service ? { service } : {}),
    ...(subtype ? { subtype } : {}),
    ...(platform ? { platform } : {}),
    ...(formatId ? { formatId } : {}),
    ...(placementId ? { placementId } : {}),
    ...(generatedWidth !== undefined ? { generatedWidth } : {}),
    ...(generatedHeight !== undefined ? { generatedHeight } : {}),
    ...(confirmedOverride !== undefined ? { confirmedOverride } : {}),
    ...(dimensionsAreExplicit ? { dimensionsAreExplicit: true } : {}),
    ...(productionReleaseEligible !== undefined
      ? { productionReleaseEligible }
      : {}),
    ...(failedGateHygieneIds?.length
      ? { failedGateHygieneIds }
      : {}),
    ...(evidencedGateHygieneIds?.length
      ? { evidencedGateHygieneIds }
      : {}),
    ...(weightedExceptionIds?.length
      ? { weightedExceptionIds }
      : {}),
    ...(blockOnReview !== undefined ? { blockOnReview } : {}),
  });
}
