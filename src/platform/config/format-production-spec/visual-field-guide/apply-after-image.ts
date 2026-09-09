/**
 * Phase 6 — Apply Visual Field Guide measured (+ optional vision) evidence
 * after sync image outputs are available, before auto-delivery.
 */

import { analyzeImageBytes } from "../../../os/evaluation/artifact-evaluation/image-analyzer";
import { logProductionSpecTelemetry } from "../production-spec-telemetry";
import { stampVisualFieldGuideEvidenceOnMetadata } from "./stamp-evidence";
import {
  resolveVisualFieldGuideVisionRollout,
  visualFieldGuideVisionShouldRun,
} from "./vision-rollout";
import { getVisualFieldGuideJudgeRunner } from "./vision-judge";

type ImageMediaRef = {
  readonly mimeType?: string;
  readonly url?: string;
  readonly base64?: string;
  readonly width?: number;
  readonly height?: number;
};

function extractBase64FromDataUrl(url: string): string | undefined {
  const marker = ";base64,";
  const idx = url.indexOf(marker);
  if (!url.startsWith("data:") || idx < 0) return undefined;
  const raw = url.slice(idx + marker.length).trim();
  return raw || undefined;
}

/** Local extract to avoid config → api layer dependency. */
function listImageMediaRefs(
  runtimeOutput: Readonly<Record<string, unknown>> | undefined,
): readonly ImageMediaRef[] {
  if (!runtimeOutput) return [];
  const fromOutputs = Array.isArray(runtimeOutput.outputs)
    ? runtimeOutput.outputs.filter((item): item is ImageMediaRef & { type: string } => {
        if (!item || typeof item !== "object") return false;
        const rec = item as Record<string, unknown>;
        return rec.type === "image";
      })
    : [];
  if (fromOutputs.length > 0) {
    return fromOutputs.map((o) => ({
      mimeType: o.mimeType,
      url: o.url,
      base64: o.base64,
      width: o.width,
      height: o.height,
    }));
  }
  return [];
}

export type ApplyVisualFieldGuideEvidenceAfterImageInput = {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly runtimeOutput?: Readonly<Record<string, unknown>>;
  readonly executionId?: string;
  readonly organizationId?: string;
  /** Force skip vision even when rollout allows. */
  readonly skipVisionJudge?: boolean;
};

export type ApplyVisualFieldGuideEvidenceAfterImageResult = {
  readonly metadata: Record<string, unknown>;
  readonly applied: boolean;
  readonly visionRan: boolean;
  readonly generatedWidth?: number;
  readonly generatedHeight?: number;
};

/**
 * Extract first image from runtime output, measure dims, stamp Field Guide evidence.
 * Safe no-op when no image media is present.
 */
export async function applyVisualFieldGuideEvidenceAfterImage(
  input: ApplyVisualFieldGuideEvidenceAfterImageInput,
): Promise<ApplyVisualFieldGuideEvidenceAfterImageResult> {
  const baseMeta: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };
  const images = listImageMediaRefs(input.runtimeOutput);
  if (images.length === 0) {
    return Object.freeze({
      metadata: baseMeta,
      applied: false,
      visionRan: false,
    });
  }

  const image = images[0]!;
  const fromField =
    typeof image.base64 === "string" && image.base64.trim()
      ? image.base64.trim()
      : undefined;
  const fromDataUrl =
    typeof image.url === "string"
      ? extractBase64FromDataUrl(image.url)
      : undefined;
  const base64 = fromField ?? fromDataUrl;
  const httpsUrl =
    !base64 &&
    typeof image.url === "string" &&
    /^https?:\/\//i.test(image.url)
      ? image.url
      : undefined;

  let imageBytes: Buffer | undefined;
  if (base64) {
    try {
      imageBytes = Buffer.from(base64, "base64");
    } catch {
      imageBytes = undefined;
    }
  }

  let generatedWidth =
    typeof image.width === "number" && image.width > 0
      ? image.width
      : undefined;
  let generatedHeight =
    typeof image.height === "number" && image.height > 0
      ? image.height
      : undefined;

  if (imageBytes && (!generatedWidth || !generatedHeight)) {
    const analyzed = analyzeImageBytes(imageBytes, image.mimeType);
    if (analyzed.width && analyzed.height) {
      generatedWidth = analyzed.width;
      generatedHeight = analyzed.height;
    }
  }

  const service =
    typeof baseMeta.service === "string" ? baseMeta.service : undefined;
  const visionRollout = resolveVisualFieldGuideVisionRollout();
  const wantVision =
    input.skipVisionJudge !== true &&
    visualFieldGuideVisionShouldRun({ service, rollout: visionRollout }) &&
    Boolean(getVisualFieldGuideJudgeRunner());

  const briefSummary =
    typeof baseMeta.briefObjective === "string"
      ? baseMeta.briefObjective
      : typeof baseMeta.promptPreview === "string"
        ? baseMeta.promptPreview
        : undefined;

  try {
    const stamped = await stampVisualFieldGuideEvidenceOnMetadata({
      metadata: baseMeta,
      generatedWidth,
      generatedHeight,
      imageBytes,
      imageUrl: httpsUrl,
      mimeType: image.mimeType,
      briefSummary,
      skipVisionJudge: !wantVision,
    });

    logProductionSpecTelemetry({
      event: "production_spec.visual_field_guide_evidence",
      productionRuleId:
        typeof stamped.metadata.productionRuleId === "string"
          ? stamped.metadata.productionRuleId
          : undefined,
      service,
      platform:
        typeof stamped.metadata.platform === "string"
          ? stamped.metadata.platform
          : undefined,
      organizationId: input.organizationId,
      executionId: input.executionId,
      injected: true,
      status: wantVision
        ? stamped.vision?.status === "ok"
          ? "VISION_OK"
          : stamped.vision?.status === "skipped"
            ? "VISION_SKIPPED"
            : "VISION_ERROR"
        : "MEASURED_ONLY",
      reason: [
        generatedWidth && generatedHeight
          ? `dims=${generatedWidth}x${generatedHeight}`
          : "dims=unknown",
        `failed=${(stamped.metadata.failedGateHygieneIds as string[] | undefined)?.length ?? 0}`,
        `evidenced=${(stamped.metadata.evidencedGateHygieneIds as string[] | undefined)?.length ?? 0}`,
        `visionRollout=${visionRollout}`,
      ].join(";"),
    });

    return Object.freeze({
      metadata: stamped.metadata,
      applied: true,
      visionRan: wantVision,
      ...(generatedWidth !== undefined ? { generatedWidth } : {}),
      ...(generatedHeight !== undefined ? { generatedHeight } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logProductionSpecTelemetry({
      event: "production_spec.visual_field_guide_evidence",
      service,
      organizationId: input.organizationId,
      executionId: input.executionId,
      injected: false,
      status: "EVIDENCE_ERROR",
      reason: msg.slice(0, 200),
    });
    // Do not fail the create path — leave metadata unchanged aside from dims if known.
    const fallback: Record<string, unknown> = { ...baseMeta };
    if (generatedWidth !== undefined) fallback.generatedWidth = generatedWidth;
    if (generatedHeight !== undefined) {
      fallback.generatedHeight = generatedHeight;
    }
    return Object.freeze({
      metadata: fallback,
      applied: false,
      visionRan: false,
      ...(generatedWidth !== undefined ? { generatedWidth } : {}),
      ...(generatedHeight !== undefined ? { generatedHeight } : {}),
    });
  }
}
