/**
 * Canonical → OpenAI wire request mapping.
 */

import type { ProviderAdapterRequest, ProviderWirePayload } from "../../adapters/contracts/adapter-io";
import type { DesiredCapabilityProfile } from "../contracts/openai-contracts";
import {
  isAudioSynthesizeCapability,
  isAudioTranscribeCapability,
  isEmbeddingCapability,
  normalizeAudioCapabilityId,
} from "../../common/resolve-execution-modality";

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
    // Provider-neutral structured schema → OpenAI json_schema when supplied on input.
    if (
      request.features.includes("structured_outputs") &&
      request.input.response_format &&
      typeof request.input.response_format === "object"
    ) {
      body.response_format = request.input.response_format;
    } else if (
      request.input.response_format &&
      typeof request.input.response_format === "object" &&
      (request.input.response_format as Record<string, unknown>).type === "json_schema"
    ) {
      body.response_format = request.input.response_format;
    }
    if (request.input.tools) body.tools = request.input.tools;
    if (request.input.tool_choice) body.tool_choice = request.input.tool_choice;
  } else if (operation === "embeddings") {
    // Single-input contract: text | prompt | input (string). Do not invent batching.
    const text =
      (typeof request.input.text === "string" && request.input.text) ||
      (typeof request.input.prompt === "string" && request.input.prompt) ||
      (typeof request.input.input === "string" && request.input.input) ||
      "";
    body.input = text;
  } else if (operation === "images.generations") {
    body.prompt = request.input.prompt ?? request.input.text ?? JSON.stringify(request.input);
  } else if (operation === "moderations") {
    body.input = request.input.input ?? request.input.text ?? "";
  } else if (operation === "audio.speech") {
    body.input =
      request.input.text ?? request.input.prompt ?? request.input.input ?? "";
    if (request.input.voice) body.voice = request.input.voice;
    if (request.input.response_format) body.response_format = request.input.response_format;
    if (request.input.speed !== undefined) body.speed = request.input.speed;
  } else if (operation === "audio.transcriptions") {
    const assets = request.input.assets;
    body._audioAsset =
      request.input.audio ??
      (Array.isArray(assets) ? (assets[0] as unknown) : undefined);
    if (request.input.language) body.language = request.input.language;
    if (request.input.prompt) body.prompt = request.input.prompt;
    if (request.input.response_format) body.response_format = request.input.response_format;
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
  const cap = normalizeAudioCapabilityId(String(request.capabilityId ?? ""));
  if (isAudioTranscribeCapability(cap)) return "audio.transcriptions";
  if (isAudioSynthesizeCapability(cap)) return "audio.speech";
  if (
    isEmbeddingCapability(String(request.capabilityId ?? "")) ||
    profile?.requireEmbeddings ||
    request.modality === "embedding"
  ) {
    return "embeddings";
  }
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
    case "audio.speech":
      return "/audio/speech";
    case "audio.transcriptions":
      return "/audio/transcriptions";
    default:
      return "/chat/completions";
  }
}
