/**
 * Canonical → Anthropic Messages API request mapping.
 */

import type { ProviderAdapterRequest, ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import { mapToAnthropicVisionContent } from "../../common/vision-content";

export function mapCanonicalToAnthropicRequest(
  request: ProviderAdapterRequest,
  wireModelId: string
): ProviderWirePayload {
  const isVision =
    request.features.includes("vision") ||
    request.modality === "multimodal" ||
    String(request.capabilityId).toLowerCase().includes("vision");

  const messages =
    (request.input.messages as Array<Record<string, unknown>>) ??
    (request.input.prompt || isVision
      ? [{ role: "user", content: isVision ? mapToAnthropicVisionContent(request) : request.input.prompt }]
      : [{ role: "user", content: JSON.stringify(request.input) }]);

  const anthropicMessages = messages.map((m) => {
    if (Array.isArray(m.content)) {
      return {
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      };
    }
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content:
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content),
    };
  });

  const params = request.parameters;
  const maxTokens =
    typeof params.maxTokens === "number"
      ? params.maxTokens
      : typeof params.max_tokens === "number"
        ? params.max_tokens
        : 4096;

  return Object.freeze({
    operation: "messages.create",
    path: "/v1/messages",
    body: Object.freeze({
      model: wireModelId,
      max_tokens: maxTokens,
      messages: anthropicMessages,
    }),
  });
}

export function canonicalToWireModelId(modelId: string): string {
  if (modelId.includes("/")) {
    const [prefix, ...rest] = modelId.split("/");
    if (prefix === "anthropic") return rest.join("/");
    return rest.join("/");
  }
  return modelId;
}
