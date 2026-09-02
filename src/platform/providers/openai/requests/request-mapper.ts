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
import {
  openAiImageSizeForAspectRatio,
  resolvePayloadAspectRatio,
} from "../../image/common/image-aspect-ratio";
import { normalizeOpenAiCompletionTokenParams } from "./openai-completion-params";

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

  const params = { ...(request.parameters ?? {}) } as Record<string, unknown>;
  // Internal adapter options — never forward to vendor HTTP bodies.
  delete params.features;
  delete params.feature;
  delete params.toolRuntime;
  const body: Record<string, unknown> = {
    model: resolvedModelId,
    ...params,
  };

  if (operation === "chat.completions") {
    body.messages = messages;
    if (request.streaming) body.stream = true;
    normalizeOpenAiCompletionTokenParams(body, resolvedModelId);
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
    } else if (
      request.input.response_format &&
      typeof request.input.response_format === "object"
    ) {
      body.response_format = request.input.response_format;
    }

    // OpenAI rejects json_object unless the word "json" appears in messages.
    const rf = body.response_format as { type?: string } | undefined;
    if (rf?.type === "json_object" || rf?.type === "json_schema") {
      body.messages = ensureJsonHintInMessages(
        body.messages as Array<Record<string, unknown>>,
      );
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
    // gpt-image-* rejects DALL·E-era fields like response_format; only forward known keys.
    const allowed = new Set([
      "model",
      "prompt",
      "n",
      "size",
      "quality",
      "background",
      "moderation",
      "output_format",
      "output_compression",
      "partial_images",
      "stream",
      "user",
    ]);
    for (const key of Object.keys(body)) {
      if (!allowed.has(key)) delete body[key];
    }
    body.prompt =
      request.input.prompt ?? request.input.text ?? JSON.stringify(request.input);
    // Match ChatGPT-quality output: low is a draft/preview tier (soft, artifact-heavy).
    if (body.size == null) {
      const aspectRatio =
        resolvePayloadAspectRatio(request.input as Record<string, unknown>) ??
        (typeof request.parameters?.aspectRatio === "string"
          ? request.parameters.aspectRatio
          : undefined);
      body.size = openAiImageSizeForAspectRatio(aspectRatio) ?? "1024x1024";
    }
    if (body.quality == null) {
      const productAction =
        typeof request.input?.productAction === "string"
          ? request.input.productAction.trim().toLowerCase()
          : typeof request.parameters?.productAction === "string"
            ? request.parameters.productAction.trim().toLowerCase()
            : "";
      // Route fan-out: medium is faster; refine pass uses high separately.
      body.quality =
        productAction === "route_visual" || productAction === "route_visual_refine"
          ? productAction === "route_visual_refine"
            ? "high"
            : "medium"
          : "high";
    }
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

/** OpenAI json_object mode requires the word "json" somewhere in messages. */
function ensureJsonHintInMessages(
  messages: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const hasJson = messages.some((m) => {
    const content = m.content;
    if (typeof content === "string") return /\bjson\b/i.test(content);
    if (Array.isArray(content)) {
      return content.some(
        (part) =>
          part &&
          typeof part === "object" &&
          typeof (part as { text?: string }).text === "string" &&
          /\bjson\b/i.test((part as { text: string }).text),
      );
    }
    return false;
  });
  if (hasJson) return messages;
  return [
    {
      role: "system",
      content: "Respond with valid JSON only. Do not include markdown fences.",
    },
    ...messages,
  ];
}
