/**
 * Phase 6 — Stamp Visual Field Guide measured + vision evidence onto metadata
 * so buildProductionGateFromExecutionContext / delivery auth share one evidence set.
 */

import { resolveProductionRule } from "../resolve-production-rule";
import {
  evaluateVisualFieldGuideMeasuredEvidence,
  mergeHygieneEvidenceIds,
  runVisualFieldGuideJudge,
  type VisualFieldGuideJudgeResult,
} from "./index";

export type StampVisualFieldGuideEvidenceInput = {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
  readonly imageBytes?: Buffer;
  readonly imageUrl?: string;
  readonly mimeType?: string;
  readonly briefSummary?: string;
  /** When true, skip async vision judge (measured only). */
  readonly skipVisionJudge?: boolean;
};

export type StampVisualFieldGuideEvidenceResult = {
  readonly metadata: Record<string, unknown>;
  readonly measuredFailed: readonly string[];
  readonly measuredEvidenced: readonly string[];
  readonly vision?: VisualFieldGuideJudgeResult;
};

function readString(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const v = metadata[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Merge measured (+ optional vision) Field Guide evidence into metadata arrays
 * consumed by the production release gate.
 */
export async function stampVisualFieldGuideEvidenceOnMetadata(
  input: StampVisualFieldGuideEvidenceInput,
): Promise<StampVisualFieldGuideEvidenceResult> {
  const service = readString(input.metadata, "service");
  const subtype = readString(input.metadata, "subtype");
  const platform = readString(input.metadata, "platform");
  const formatId =
    readString(input.metadata, "format") ??
    readString(input.metadata, "formatId");
  const placementId =
    readString(input.metadata, "placementId") ??
    readString(input.metadata, "productionPlacementId");

  const resolved = resolveProductionRule({
    ...(service ? { service } : {}),
    ...(subtype ? { subtype } : {}),
    ...(platform ? { platform } : {}),
    ...(formatId ? { formatId } : {}),
    ...(placementId ? { placementId } : {}),
  });

  const measured = evaluateVisualFieldGuideMeasuredEvidence({
    rule: resolved?.rule,
    service,
    generatedWidth: input.generatedWidth,
    generatedHeight: input.generatedHeight,
  });

  let vision: VisualFieldGuideJudgeResult | undefined;
  if (!input.skipVisionJudge) {
    vision = await runVisualFieldGuideJudge({
      service,
      imageBytes: input.imageBytes,
      imageUrl: input.imageUrl,
      mimeType: input.mimeType,
      briefSummary:
        input.briefSummary ??
        (typeof input.metadata.briefSummary === "string"
          ? input.metadata.briefSummary
          : undefined),
    });
  }

  const existingFailed = Array.isArray(input.metadata.failedGateHygieneIds)
    ? (input.metadata.failedGateHygieneIds as string[])
    : [];
  const existingEvidenced = Array.isArray(
    input.metadata.evidencedGateHygieneIds,
  )
    ? (input.metadata.evidencedGateHygieneIds as string[])
    : [];

  const merged = mergeHygieneEvidenceIds({
    failed: existingFailed,
    evidenced: existingEvidenced,
    extraFailed: [
      ...measured.failedGateHygieneIds,
      ...(vision?.failedGateHygieneIds ?? []),
    ],
    extraEvidenced: [
      ...measured.evidencedGateHygieneIds,
      ...(vision?.evidencedGateHygieneIds ?? []),
    ],
  });

  const next: Record<string, unknown> = {
    ...input.metadata,
    failedGateHygieneIds: merged.failedGateHygieneIds,
    evidencedGateHygieneIds: merged.evidencedGateHygieneIds,
    visualFieldGuideMeasuredChecks: measured.checks,
  };

  if (vision) {
    next.visualFieldGuideVisionStatus = vision.status;
    next.visualFieldGuideVisionUnresolved = vision.unresolvedGateHygieneIds;
    next.visualFieldGuideVisionEvidence = vision.evidence;
  }

  if (
    typeof input.generatedWidth === "number" &&
    Number.isFinite(input.generatedWidth)
  ) {
    next.generatedWidth = input.generatedWidth;
  }
  if (
    typeof input.generatedHeight === "number" &&
    Number.isFinite(input.generatedHeight)
  ) {
    next.generatedHeight = input.generatedHeight;
  }

  return Object.freeze({
    metadata: next,
    measuredFailed: measured.failedGateHygieneIds,
    measuredEvidenced: measured.evidencedGateHygieneIds,
    ...(vision ? { vision } : {}),
  });
}
