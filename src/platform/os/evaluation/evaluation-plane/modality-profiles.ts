/**
 * Step 7 — Capability profiles derived from Step 1 output taxonomy.
 */

import type { ServiceOutputKind } from "../../../config/service-output-map";
import type { ModalityCapabilities } from "./types";

const WEB_KINDS = new Set(["deferred_website"]);
const HTML_KINDS = new Set(["deferred_website", "email"]);
const VISUAL_KINDS = new Set([
  "image",
  "image_mockup",
  "image_3d_mockup",
  "edited_image",
]);
const DOCUMENT_KINDS = new Set(["document"]);
const PRESENTATION_KINDS = new Set(["presentation"]);
const VIDEO_KINDS = new Set(["video", "animation"]);
const TEXT_KINDS = new Set(["text", "dynamic", "human_form"]);

const SEO_DIMS = ["quality.seo", "seo"];
const A11Y_DIMS = ["quality.accessibility", "accessibility"];
const PERF_DIMS = ["quality.performance", "performance"];
const RUNTIME_DIMS = ["hard.website.no_critical_runtime", "hard.website.responsive"];
const VISUAL_DIMS = [
  "quality.visual_quality",
  "quality.visual_hierarchy",
  "quality.brand_adherence",
];
const SEMANTIC_DIMS = ["quality.ux", "quality.content"];

function baseProfile(kind: string): ModalityCapabilities {
  const applicable: string[] = [...SEMANTIC_DIMS];
  const notApplicable: string[] = [];

  let supportsStatic = true;
  let supportsRendered = false;
  let supportsRuntime = false;
  let supportsIndependentJudgement = false;

  if (TEXT_KINDS.has(kind)) {
    notApplicable.push(...SEO_DIMS, ...A11Y_DIMS, ...PERF_DIMS, ...RUNTIME_DIMS, ...VISUAL_DIMS);
  } else if (VISUAL_KINDS.has(kind)) {
    supportsRendered = true;
    supportsIndependentJudgement = true;
    applicable.push(...VISUAL_DIMS);
    notApplicable.push(...SEO_DIMS, ...A11Y_DIMS, ...PERF_DIMS, ...RUNTIME_DIMS);
  } else if (DOCUMENT_KINDS.has(kind)) {
    supportsRendered = true;
    applicable.push("quality.visual_quality", "quality.visual_hierarchy");
    notApplicable.push(...SEO_DIMS, ...RUNTIME_DIMS, ...PERF_DIMS);
  } else if (PRESENTATION_KINDS.has(kind)) {
    supportsRendered = true;
    applicable.push(...VISUAL_DIMS);
    notApplicable.push(...SEO_DIMS, ...RUNTIME_DIMS, ...PERF_DIMS);
  } else if (HTML_KINDS.has(kind)) {
    supportsRendered = true;
    supportsRuntime = WEB_KINDS.has(kind);
    applicable.push(...SEO_DIMS, ...A11Y_DIMS, ...VISUAL_DIMS);
    if (WEB_KINDS.has(kind)) {
      applicable.push(...PERF_DIMS, ...RUNTIME_DIMS);
    } else {
      notApplicable.push(...PERF_DIMS, ...RUNTIME_DIMS);
    }
  } else if (VIDEO_KINDS.has(kind)) {
    supportsRendered = true;
    applicable.push("quality.visual_quality");
    notApplicable.push(...SEO_DIMS, ...A11Y_DIMS, ...PERF_DIMS, ...RUNTIME_DIMS);
  } else {
    notApplicable.push(...SEO_DIMS, ...A11Y_DIMS, ...PERF_DIMS, ...RUNTIME_DIMS);
  }

  return Object.freeze({
    outputKind: kind,
    supportsStatic,
    supportsRendered,
    supportsRuntime,
    supportsIndependentJudgement,
    applicableDimensions: Object.freeze(applicable),
    notApplicableDimensions: Object.freeze(notApplicable),
  });
}

export function resolveModalityProfile(
  outputKind?: ServiceOutputKind | string,
): ModalityCapabilities {
  const kind = (outputKind ?? "dynamic").toLowerCase();
  return baseProfile(kind);
}

export function resolveDimensionApplicability(
  profile: ModalityCapabilities,
  dimensionId: string,
): { readonly status: import("./types").MeasurementStatus; readonly reason: string } {
  const id = dimensionId.toLowerCase();
  if (profile.notApplicableDimensions.some((d) => id.includes(d.replace("quality.", "")) || id === d)) {
    return Object.freeze({ status: "NOT_APPLICABLE", reason: `not applicable to ${profile.outputKind}` });
  }
  if (profile.applicableDimensions.some((d) => id.includes(d.replace("quality.", "")) || id === d)) {
    return Object.freeze({ status: "NOT_AUTOMATED", reason: "applicable — awaiting evaluator" });
  }
  return Object.freeze({ status: "UNVERIFIED", reason: "dimension applicability unknown" });
}
