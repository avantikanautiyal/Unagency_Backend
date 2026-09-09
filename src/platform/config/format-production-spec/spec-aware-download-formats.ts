/**
 * Phase 3 — Spec-aware download format resolution.
 * Always intersects selectable formats with Production Spec export.formats
 * when a rule resolves.
 */

import {
  resolveSelectableDownloadFormats,
  type DownloadFormat,
  type ServiceOutputSpec,
} from "../service-output-map";
import { resolveProductionExportFormats } from "./resolve-production-rule";
import type { ResolveProductionRuleInput } from "./types";

export function resolveSpecAwareDownloadFormats(input: {
  readonly production?: ResolveProductionRuleInput;
  readonly productionExportFormats?: readonly string[] | null;
  readonly spec?: Pick<
    ServiceOutputSpec,
    "supportedDownloadFormats" | "defaultDownloadFormat"
  > | null;
  readonly mimeType?: string | null;
  readonly materializedFormats?: readonly string[] | null;
  readonly requestedDeliverables?: readonly string[] | null;
}): readonly DownloadFormat[] {
  const fromRule = input.production
    ? resolveProductionExportFormats(input.production)
    : undefined;
  const productionExportFormats =
    input.productionExportFormats ?? fromRule ?? null;

  return resolveSelectableDownloadFormats({
    spec: input.spec,
    mimeType: input.mimeType,
    materializedFormats: input.materializedFormats,
    requestedDeliverables: input.requestedDeliverables,
    productionExportFormats,
  });
}
