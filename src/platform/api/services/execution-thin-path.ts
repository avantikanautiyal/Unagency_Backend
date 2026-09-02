/**
 * Thin create path — all executions use direct prompt → provider.
 * Model selection via client matrix routers in prepass.
 * Output format from service-output-map spreadsheet.
 *
 * Single backend contract: applyDirectPassthroughMetadata (always applied in prepass).
 * Client counterpart: withThinDirectExecutionMetadata in @unagency/api.
 */

import {
  isImageGenerationCapability,
  isVideoGenerationCapability,
} from "../../providers/common/resolve-execution-modality";

/** Force thin/direct metadata — the only live thin-path writer on create. */
export function applyDirectPassthroughMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  next.directPassthrough = true;
  next.directProvider = true;
  next.thinOsPath = true;
  delete next.enrichedPrompt;
  delete next.enableExecutionPlan;
  delete next.taskGraphRecommended;
  // Phase A4: keep pack fan-out marker only when Continuity pack planner stamped it.
  const allowPack =
    next.continuityPack === true &&
    next.packPlan != null &&
    typeof next.packPlan === "object";
  if (!allowPack) {
    delete next.multiDeliverable;
  }
  if (!productActionFromMetadata(next)) {
    next.productAction = "direct_passthrough";
  }
  return next;
}

export function productActionFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  return typeof metadata?.productAction === "string"
    ? metadata.productAction.trim()
    : undefined;
}

/**
 * Image/video providers return binary artifacts — never JSON schemas.
 * Strip presentation/LaunchPlan structured output inherited from parent runs
 * or stale client metadata (e.g. performance-ads route_visual fan-out).
 */
export function sanitizeMediaGenerationCreateMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly capabilityId: string;
  readonly structuredOutput?: unknown;
}): {
  readonly metadata: Record<string, unknown>;
  readonly structuredOutput: unknown | undefined;
} {
  const cap = input.capabilityId.trim().toLowerCase();
  const isVideo = isVideoGenerationCapability(cap);
  const isImage = isImageGenerationCapability(cap);
  if (!isVideo && !isImage) {
    return {
      metadata: { ...input.metadata },
      structuredOutput: input.structuredOutput,
    };
  }

  const next: Record<string, unknown> = { ...input.metadata };
  for (const key of [
    "structuredOutput",
    "presentationExpandMode",
    "deliverableRequired",
    "presentationPhase",
    "presentationLockedConcept",
    "presentationMeta",
    "presentationConcepts",
    "presentationRelevance",
    "presentationMustUse",
    "presentationQuality",
  ]) {
    delete next[key];
  }

  const outputKind =
    typeof next.outputKind === "string" ? next.outputKind.trim().toLowerCase() : "";
  if (
    !outputKind ||
    outputKind === "presentation" ||
    outputKind === "document" ||
    outputKind === "email" ||
    outputKind === "deferred_website" ||
    outputKind === "website"
  ) {
    next.outputKind = isVideo ? "video" : "image";
  }

  return {
    metadata: applyDirectPassthroughMetadata(next),
    structuredOutput: undefined,
  };
}

export function isWebsiteGenerationMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  const service =
    typeof metadata?.service === "string"
      ? metadata.service.trim().toLowerCase()
      : "";
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.trim().toLowerCase()
      : "";
  return service === "website" || outputKind === "deferred_website" || outputKind === "website";
}

/** Pitch decks: concepts + expansion + export routinely exceed 3 minutes. */
export function isLongRunningPresentationMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  const service =
    typeof metadata?.service === "string"
      ? metadata.service.trim().toLowerCase()
      : "";
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.trim().toLowerCase()
      : "";
  const subtype =
    typeof metadata?.subtype === "string"
      ? metadata.subtype.trim().toLowerCase()
      : "";
  if (subtype === "gifs") return false;
  return service === "presentations" || outputKind === "presentation";
}

/** Brochures / print documents: large briefs + DocumentPlan JSON + PDF export. */
export function isLongRunningDocumentMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): boolean {
  const service =
    typeof metadata?.service === "string"
      ? metadata.service.trim().toLowerCase()
      : "";
  const outputKind =
    typeof metadata?.outputKind === "string"
      ? metadata.outputKind.trim().toLowerCase()
      : "";
  const subtype =
    typeof metadata?.subtype === "string"
      ? metadata.subtype.trim().toLowerCase()
      : "";
  if (service === "presentations" || outputKind === "presentation") return false;
  return (
    outputKind === "document" ||
    (service === "print" &&
      /brochure|leaflet|guideline|report|catalog/i.test(subtype))
  );
}
