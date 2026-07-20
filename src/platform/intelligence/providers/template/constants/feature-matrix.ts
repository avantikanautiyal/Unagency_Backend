/**
 * Standard feature matrix — all providers expose the same feature catalog.
 */

import type { TemplateFeatureDescriptor } from "../contracts/features";
import type { TemplateFeatureKind } from "../contracts/enums";

const FEATURE_LABELS: Record<TemplateFeatureKind, string> = {
  text_generation: "Text Generation",
  reasoning: "Reasoning",
  vision: "Vision",
  image_generation: "Image Generation",
  video_generation: "Video Generation",
  audio_input: "Audio Input",
  audio_output: "Audio Output",
  embeddings: "Embeddings",
  moderation: "Moderation",
  streaming: "Streaming",
  tool_calling: "Tool Calling",
  function_calling: "Function Calling",
  structured_output: "Structured Output",
  json_mode: "JSON Mode",
  assistants: "Assistants",
  fine_tuning: "Fine Tuning",
  realtime: "Realtime",
  batch: "Batch",
};

export function buildFeatureMatrix(
  supported: Readonly<Set<TemplateFeatureKind>>,
  nowIso: () => string = () => new Date().toISOString()
) {
  const features: TemplateFeatureDescriptor[] = (
    Object.keys(FEATURE_LABELS) as TemplateFeatureKind[]
  ).map((kind) => ({
    kind,
    supported: supported.has(kind),
    label: FEATURE_LABELS[kind],
  }));

  return {
    features,
    supportedCount: features.filter((f) => f.supported).length,
    computedAt: nowIso(),
  };
}

export const ALL_TEMPLATE_FEATURES = Object.keys(
  FEATURE_LABELS
) as TemplateFeatureKind[];
