/**
 * Auto-deliver primary artifact when execution succeeds (export destination).
 * Applies Format & Production Spec release gate when metadata is available.
 */

import type { OsDeliveryService } from "../../os/delivery/engine/delivery-service";
import type { ExecutionArtifactRef } from "../contracts";
import {
  buildProductionExportFilename,
  buildProductionGateFromExecutionContext,
  resolveProductionRule,
  sizeTokenFromCanvas,
} from "../../config/format-production-spec";

export async function maybeAutoDeliverOnSuccess(input: {
  readonly deliveryService: OsDeliveryService;
  readonly organizationId: string;
  readonly executionId: string;
  readonly artifactRefs: readonly ExecutionArtifactRef[];
  readonly nowIso: () => string;
  readonly createId: (prefix: string) => string;
  /** Execution/job metadata for production gate + filename. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Promise<{ readonly deliveryId?: string; readonly error?: string }> {
  const primary =
    input.artifactRefs.find((a) => a.kind === "media") ??
    input.artifactRefs.find((a) => a.kind === "response") ??
    input.artifactRefs[0];
  if (!primary?.artifactId) {
    return {};
  }

  const productionGate = buildProductionGateFromExecutionContext(input.metadata);
  const suggestedFilename = resolveSuggestedExportFilename({
    metadata: input.metadata,
    mimeType: primary.mimeType,
    nowIso: input.nowIso,
  });

  try {
    const auth = await input.deliveryService.authorize({
      organizationId: input.organizationId,
      artifactId: primary.artifactId,
      artifactVersion: 1,
      executionId: input.executionId,
      destination: "export",
      executionMetadata: input.metadata,
      ...(productionGate ? { productionGate } : {}),
    });
    if (!auth.authorized) {
      return { error: auth.reason ?? "delivery_not_authorized" };
    }

    const receipt = await input.deliveryService.createDelivery({
      organizationId: input.organizationId,
      artifactId: primary.artifactId,
      artifactVersion: 1,
      executionId: input.executionId,
      destination: "export",
      deliveryIntent: "auto_on_success",
      nowIso: input.nowIso,
      createId: input.createId,
      executionMetadata: input.metadata,
      ...(productionGate ? { productionGate } : {}),
      ...(suggestedFilename ? { suggestedFilename } : {}),
    });
    if (receipt.status === "DENIED") {
      return { error: receipt.failureReason ?? "delivery_denied" };
    }
    return { deliveryId: receipt.deliveryId };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "auto_delivery_failed",
    };
  }
}

function extensionFromMime(mimeType?: string): string {
  const m = (mimeType ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "bin";
}

function resolveSuggestedExportFilename(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly mimeType?: string;
  readonly nowIso: () => string;
}): string | undefined {
  const gateInput = buildProductionGateFromExecutionContext(input.metadata);
  if (!gateInput) return undefined;

  const resolved = resolveProductionRule(gateInput);
  const canvas = resolved?.rule.canvas;
  const size =
    sizeTokenFromCanvas(gateInput.generatedWidth, gateInput.generatedHeight) ??
    (canvas?.unit === "px"
      ? sizeTokenFromCanvas(canvas.width, canvas.height)
      : canvas
        ? sizeTokenFromCanvas(canvas.width, canvas.height, canvas.unit)
        : undefined);

  const service =
    typeof input.metadata?.service === "string"
      ? input.metadata.service
      : gateInput.service;
  const placement =
    resolved?.rule.placement ??
    gateInput.formatId ??
    gateInput.placementId;

  return buildProductionExportFilename({
    service,
    placement,
    size,
    extension: extensionFromMime(input.mimeType),
    date: input.nowIso(),
  });
}
