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
import {
  applyReferenceRolePromptGuidance,
  extractReferenceImages,
  referenceImageToDataUrl,
} from "../../image/common/vendor-image-protocol";
import { normalizeOpenAiCompletionTokenParams } from "./openai-completion-params";
import {
  isCanonicalModelRequest,
  mapCanonicalModelRequestToProviderPayload,
  extractCanonicalMultimodalProviderHandoff,
  canonicalImageDeliveriesToOpenAIContentParts,
  CANONICAL_MULTIMODAL_MAPPING_SOURCE,
} from "../../../ai/canonical-model-request";
import { normalizeSchemaForOpenAiStrict } from "../../tools/structured/structured-output-execution";

export function mapCanonicalToOpenAIRequest(
  request: ProviderAdapterRequest,
  resolvedModelId: string,
  profile?: DesiredCapabilityProfile
): ProviderWirePayload {
  const operation = resolveOperation(request, profile);

  // Phase 4 / 9A — CanonicalModelRequest → labeled prompt + multimodal from CMR.
  let inputForMessages = request.input as Record<string, unknown>;
  const cmr = inputForMessages.canonicalModelRequest;
  let multimodalMapped = 0;
  let multimodalOmitted = 0;
  let multimodalMappingSource: string | undefined;
  if (isCanonicalModelRequest(cmr) && !inputForMessages.messages) {
    const handoff = extractCanonicalMultimodalProviderHandoff(cmr, {
      supportsImageInput: true,
    });
    multimodalMappingSource = handoff.applied
      ? CANONICAL_MULTIMODAL_MAPPING_SOURCE
      : undefined;
    multimodalMapped = handoff.mappedCount;
    multimodalOmitted = handoff.omitted.length;
    const projected = mapCanonicalModelRequestToProviderPayload(cmr, {
      multimodalProviderMappedCount: multimodalMapped,
      multimodalProviderOmittedCount: multimodalOmitted,
    });
    // Phase 9A: image parts from CMR multimodal_context only — not input.assets.
    const imageParts = canonicalImageDeliveriesToOpenAIContentParts(
      handoff.imageDeliveries,
    );
    const messages =
      imageParts.length > 0
        ? [
            {
              role: "user",
              content: [
                { type: "text", text: projected.prompt },
                ...imageParts,
              ],
            },
          ]
        : [...projected.messages];
    inputForMessages = {
      ...inputForMessages,
      prompt: projected.prompt,
      text: projected.prompt,
      input: projected.prompt,
      messages,
      multimodalProviderMappedCount: multimodalMapped,
      multimodalProviderOmittedCount: multimodalOmitted,
      multimodalContextPresent: projected.multimodalContextPresent,
      canonicalMultimodalProviderMappingApplied: handoff.applied,
      canonicalMultimodalMappingSource: multimodalMappingSource,
      canonicalMultimodalMappedCount: multimodalMapped,
      canonicalMultimodalOmittedCount: multimodalOmitted,
      canonicalMultimodalItemCount: handoff.itemCount,
    };
  }

  const messages =
    (inputForMessages.messages as unknown[]) ??
    (inputForMessages.prompt
      ? [{ role: "user", content: inputForMessages.prompt }]
      : [{ role: "user", content: JSON.stringify(inputForMessages) }]);

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

    const rf = body.response_format as { type?: string } | undefined;
    if (rf?.type === "json_object" || rf?.type === "json_schema") {
      body.messages = ensureJsonHintInMessages(
        body.messages as Array<Record<string, unknown>>,
      );
    }

    applyOpenAiStrictJsonSchemaOnWire(body);

    if (request.input.tools) body.tools = request.input.tools;
    if (request.input.tool_choice) body.tool_choice = request.input.tool_choice;
  } else if (operation === "embeddings") {
    const text =
      (typeof request.input.text === "string" && request.input.text) ||
      (typeof request.input.prompt === "string" && request.input.prompt) ||
      (typeof request.input.input === "string" && request.input.input) ||
      "";
    body.input = text;
  } else if (
    operation === "images.generations" ||
    operation === "images.edits"
  ) {
    applyOpenAiImageBody(body, request, operation);
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

/**
 * OpenAI's images.generate/images.edit `prompt` param has a documented hard
 * cap (currently 32000 chars) — independent of any phase or brand. A
 * compiled canonical prompt (brand context + composition requirements +
 * upstream refs) can legitimately cross this for any image phase, not just
 * one. Truncating here (provider-boundary, not phase-specific) is the
 * generic fix — never silent: logged so an oversized compiled prompt stays
 * diagnosable rather than just quietly shorter.
 */
const OPENAI_IMAGE_PROMPT_MAX_LENGTH = 32000;

function fitOpenAiImagePrompt(prompt: string, correlationId?: string): string {
  if (prompt.length <= OPENAI_IMAGE_PROMPT_MAX_LENGTH) return prompt;
  const truncated = prompt.slice(0, OPENAI_IMAGE_PROMPT_MAX_LENGTH);
  console.warn(
    JSON.stringify({
      scope: "provider.openai.image_prompt_truncated",
      correlationId,
      originalLength: prompt.length,
      truncatedLength: truncated.length,
      maxLength: OPENAI_IMAGE_PROMPT_MAX_LENGTH,
      droppedLength: prompt.length - truncated.length,
    }),
  );
  return truncated;
}

function applyOpenAiImageBody(
  body: Record<string, unknown>,
  request: ProviderAdapterRequest,
  operation: "images.generations" | "images.edits",
): void {
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
    "images",
    "input_fidelity",
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) delete body[key];
  }

  const basePrompt = String(
    request.input.prompt ?? request.input.text ?? JSON.stringify(request.input)
  ).trim();

  if (operation === "images.edits") {
    const refs = extractReferenceImages(
      request.input as Record<string, unknown>,
      request.metadata as Readonly<Record<string, unknown>> | undefined,
    );
    const imageUrls = refs
      .map((ref) => referenceImageToDataUrl(ref))
      .filter((url): url is string => Boolean(url))
      .slice(0, 16);
    body.images = imageUrls.map((image_url) => ({ image_url }));
    if (body.input_fidelity == null) {
      body.input_fidelity = "high";
    }
    const { prompt: rolePrompt } = applyReferenceRolePromptGuidance({
      basePrompt,
      references: refs,
    });
    body.prompt = fitOpenAiImagePrompt(rolePrompt, request.requestId);
  } else {
    delete body.images;
    delete body.input_fidelity;
    body.prompt = fitOpenAiImagePrompt(basePrompt, request.requestId);
  }

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
    body.quality =
      productAction === "route_visual" || productAction === "route_visual_refine"
        ? productAction === "route_visual_refine"
          ? "high"
          : "medium"
        : "high";
  }
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
  const isImage =
    profile?.modality === "image" ||
    request.modality === "image" ||
    cap === "image.generate" ||
    cap === "image.edit";
  if (isImage) {
    // ChatGPT attaches images via /v1/images/edits for gpt-image-* models.
    if (
      cap === "image.edit" ||
      extractReferenceImages(request.input as Record<string, unknown>).length > 0
    ) {
      return "images.edits";
    }
    return "images.generations";
  }
  if (request.features.includes("moderation")) return "moderations";
  return "chat.completions";
}

function pathForOperation(operation: string): string {
  switch (operation) {
    case "embeddings":
      return "/embeddings";
    case "images.generations":
      return "/images/generations";
    case "images.edits":
      return "/images/edits";
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

/** OpenAI strict json_schema normalization — wire only, never mutates canonical envelope. */
function applyOpenAiStrictJsonSchemaOnWire(body: Record<string, unknown>): void {
  const rf = body.response_format;
  if (!rf || typeof rf !== "object") return;
  const typed = rf as {
    type?: string;
    json_schema?: { name?: string; strict?: boolean; schema?: unknown };
  };
  if (typed.type !== "json_schema" || !typed.json_schema?.schema) return;
  if (typeof typed.json_schema.schema !== "object") return;
  body.response_format = {
    ...typed,
    json_schema: {
      ...typed.json_schema,
      schema: normalizeSchemaForOpenAiStrict(
        typed.json_schema.schema as Record<string, unknown>,
      ),
    },
  };
}
