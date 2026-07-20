/**
 * Canonical → OpenAI wire request mapping.
 */

import type { ProviderAdapterRequest, ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { DesiredCapabilityProfile } from "../contracts/openai-contracts";

export function mapCanonicalToOpenAIRequest(
  request: ProviderAdapterRequest,
  resolvedModelId: string,
  profile?: DesiredCapabilityProfile
): ProviderWirePayload {
  const operation = resolveOperation(request, profile);
  const messages =
    (request.input.messages as unknown[]) ??
    (request.input.prompt
      ? [{ role: "user", content: request.input.prompt }]
      : [{ role: "user", content: JSON.stringify(request.input) }]);

  const params = request.parameters;
  const body: Record<string, unknown> = {
    model: resolvedModelId,
    ...params,
  };

  if (operation === "chat.completions") {
    body.messages = messages;
    if (request.streaming) body.stream = true;
    if (params.maxTokens && !params.max_tokens) {
      body.max_tokens = params.maxTokens;
      delete body.maxTokens;
    }
    if (request.features.includes("json_mode") || profile?.requireJsonMode) {
      body.response_format = body.response_format ?? { type: "json_object" };
    }
    if (request.input.tools) body.tools = request.input.tools;
    if (request.input.tool_choice) body.tool_choice = request.input.tool_choice;
  } else if (operation === "embeddings") {
    body.input = request.input.input ?? request.input.text ?? request.input;
  } else if (operation === "images.generations") {
    body.prompt = request.input.prompt ?? request.input.text ?? JSON.stringify(request.input);
  } else if (operation === "moderations") {
    body.input = request.input.input ?? request.input.text ?? "";
  }

  return Object.freeze({
    operation,
    path: pathForOperation(operation),
    body: Object.freeze(body),
  });
}

function resolveOperation(
  request: ProviderAdapterRequest,
  profile?: DesiredCapabilityProfile
): string {
  if (profile?.requireEmbeddings || request.modality === "embedding") return "embeddings";
  if (profile?.modality === "image" || request.modality === "image") return "images.generations";
  if (request.features.includes("moderation")) return "moderations";
  return "chat.completions";
}

function pathForOperation(operation: string): string {
  switch (operation) {
    case "embeddings":
      return "/embeddings";
    case "images.generations":
      return "/images/generations";
    case "moderations":
      return "/moderations";
    default:
      return "/chat/completions";
  }
}
