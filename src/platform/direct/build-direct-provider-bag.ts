/**
 * Build a minimal artifact bag for direct prompt → provider execution.
 */

import type { IntegrationArtifactBag, DirectExecutionRequest } from "./contracts";

function resolveCapabilityId(request: DirectExecutionRequest): string {
  const meta = request.metadata ?? {};
  const hint =
    typeof meta.capabilityHint === "string"
      ? meta.capabilityHint
      : typeof meta.capabilityId === "string"
        ? meta.capabilityId
        : undefined;
  if (hint?.trim()) return hint.trim();
  const outputKind =
    typeof meta.outputKind === "string" ? meta.outputKind.toLowerCase() : "";
  if (outputKind === "video" || outputKind === "animation") return "video.generate";
  if (outputKind === "edited_image") return "image.edit";
  if (
    outputKind === "image" ||
    outputKind === "image_mockup" ||
    outputKind === "image_3d_mockup"
  ) {
    return "image.generate";
  }
  return "text.generate";
}

function resolveProviderModel(request: DirectExecutionRequest): {
  providerId: string;
  modelId: string;
} {
  const meta = request.metadata ?? {};
  const providerId =
    (typeof meta.preferredProviderId === "string" && meta.preferredProviderId.trim()) ||
    (typeof meta.providerId === "string" && meta.providerId.trim()) ||
    "provider.openai";
  const modelId =
    (typeof meta.preferredModelId === "string" && meta.preferredModelId.trim()) ||
    (typeof meta.modelId === "string" && meta.modelId.trim()) ||
    "gpt-4o";
  return { providerId, modelId };
}

export function buildDirectProviderBag(
  request: DirectExecutionRequest
): IntegrationArtifactBag {
  const capabilityId = resolveCapabilityId(request);
  const { providerId, modelId } = resolveProviderModel(request);
  return {
    task: {
      request: { rawPrompt: request.rawPrompt },
      capabilityMap: { primary: capabilityId },
    },
    routing: {
      plan: {
        primary: { providerId, modelId },
      },
    },
  };
}
