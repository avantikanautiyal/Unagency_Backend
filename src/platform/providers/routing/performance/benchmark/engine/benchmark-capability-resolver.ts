/**
 * Resolve benchmark output kind → provider capability (uses existing capability IDs).
 */

import type { BenchmarkCase } from "../contracts/benchmark-case";

export type ResolvedBenchmarkCapability = {
  readonly capabilityId: string;
  readonly modality: "text" | "image" | "video" | "audio" | "embedding";
  readonly requiresStructuredOutput: boolean;
};

const STRUCTURED_OUTPUT_KINDS = new Set([
  "document",
  "presentation",
  "deferred_website",
  "email",
]);

export function resolveBenchmarkCapability(
  benchmarkCase: BenchmarkCase,
): ResolvedBenchmarkCapability {
  const kind = benchmarkCase.outputKind.toLowerCase();

  if (
    kind === "image" ||
    kind === "image_mockup" ||
    kind === "image_3d_mockup" ||
    kind === "edited_image"
  ) {
    return Object.freeze({
      capabilityId: kind === "edited_image" ? "image.edit" : "image.generate",
      modality: "image",
      requiresStructuredOutput: false,
    });
  }

  if (kind === "video" || kind === "animation") {
    return Object.freeze({
      capabilityId: "video.generate",
      modality: "video",
      requiresStructuredOutput: false,
    });
  }

  if (kind === "audio") {
    return Object.freeze({
      capabilityId: "audio.synthesize",
      modality: "audio",
      requiresStructuredOutput: false,
    });
  }

  if (kind === "embedding") {
    return Object.freeze({
      capabilityId: "embedding.generate",
      modality: "embedding",
      requiresStructuredOutput: false,
    });
  }

  return Object.freeze({
    capabilityId: "text.generate",
    modality: "text",
    requiresStructuredOutput: STRUCTURED_OUTPUT_KINDS.has(kind),
  });
}
