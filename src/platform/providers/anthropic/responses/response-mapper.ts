/**
 * Anthropic wire → canonical response mapping.
 *
 * Structured-output contract (provider-agnostic invariant):
 * When the request carried OpenAI-style `response_format.json_schema`
 * (translated to forced tool_use on Anthropic), any matching tool_use.input
 * object MUST become `output.structured` — including CDF contracts such as
 * CdfSocialMediaRoutes. Do not gate on Presentation/Website-only shapes.
 */

import type {
  ProviderAdapterRequest,
  ProviderWirePayload,
  ProviderAdapterResponse,
} from "../../adapters/contracts/adapter-io";
import type { CanonicalFinishReason } from "../../adapters/contracts/enums";
import {
  parsePresentationRoutes,
  recoverPresentationRoutesPayload,
} from "../../../os/delivery/document-export-service";
import { recoverWebsiteRoutesPlan } from "../../../os/delivery/website-generation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function sanitizeToolName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return cleaned || "structured_output";
}

/** Resolve the forced structured-output tool name from the adapter request. */
export function resolveRequestedStructuredOutputToolName(
  request: ProviderAdapterRequest,
): string | undefined {
  const input = asRecord(request.input);
  if (input) {
    const responseFormat = asRecord(input.response_format);
    if (responseFormat && responseFormat.type === "json_schema") {
      const jsonSchema = asRecord(responseFormat.json_schema);
      const schema = jsonSchema ? asRecord(jsonSchema.schema) : undefined;
      if (jsonSchema && schema) {
        const name =
          typeof jsonSchema.name === "string" && jsonSchema.name.trim()
            ? sanitizeToolName(jsonSchema.name.trim())
            : "structured_output";
        return name;
      }
    }
  }
  // Fallback: metadata stamp (same contract identity as RF name).
  const meta = asRecord(request.metadata);
  const so = meta ? asRecord(meta.structuredOutput) : undefined;
  if (so && typeof so.name === "string" && so.name.trim()) {
    return sanitizeToolName(so.name.trim());
  }
  return undefined;
}

function isNonEmptyStructuredObject(input: unknown): input is Record<string, unknown> {
  if (!isRecord(input)) return false;
  return Object.keys(input).length > 0;
}

/** True when tool input (or recovered near-miss) is exportable PresentationRoutes. */
function toolInputHasExportableRoutes(input: unknown): boolean {
  if (input == null) return false;
  const recovered = recoverPresentationRoutesPayload(input);
  return parsePresentationRoutes(recovered) != null;
}

/** True when tool input is exportable WebsiteRoutes / WebProject. */
function toolInputHasExportableWebsite(input: unknown): boolean {
  if (input == null) return false;
  return Boolean(recoverWebsiteRoutesPlan(input)?.length);
}

function toolInputHasExportableStructured(input: unknown): boolean {
  return (
    toolInputHasExportableRoutes(input) || toolInputHasExportableWebsite(input)
  );
}

/**
 * Generic: promote tool_use / text JSON to structured when the request asked
 * for json_schema, OR when the payload is an exportable Presentation/Website
 * deliverable (legacy expansion path without RF on the mapper request stub).
 */
function shouldPromoteAsStructured(
  input: unknown,
  requestedToolName: string | undefined,
  toolName: string | undefined,
): boolean {
  if (!isNonEmptyStructuredObject(input)) return false;
  if (requestedToolName) {
    // Forced structured-output turn — promote any non-empty object from the
    // matching tool (or any tool_use when name missing on the block).
    if (!toolName || sanitizeToolName(toolName) === requestedToolName) {
      return true;
    }
  }
  // Legacy / expansion: Presentation & Website exportable shapes.
  return toolInputHasExportableStructured(input);
}

function textBlocksJoined(
  contentBlocks: Array<Record<string, unknown>> | undefined
): string {
  if (!contentBlocks?.length) return "";
  return contentBlocks
    .map((block) => (block.type === "text" ? String(block.text ?? "") : ""))
    .join("")
    .trim();
}

function extractAnthropicText(
  contentBlocks: Array<Record<string, unknown>> | undefined,
  requestedToolName: string | undefined,
): string {
  if (!contentBlocks?.length) return "";

  const textFromBlocks = textBlocksJoined(contentBlocks);
  const toolBlock = contentBlocks.find((block) => block.type === "tool_use");
  if (toolBlock && toolBlock.input != null) {
    const toolName =
      typeof toolBlock.name === "string" ? toolBlock.name : undefined;
    if (shouldPromoteAsStructured(toolBlock.input, requestedToolName, toolName)) {
      return typeof toolBlock.input === "string"
        ? toolBlock.input
        : JSON.stringify(toolBlock.input);
    }
    // Incomplete/empty tool_use payloads must not hide valid JSON in text blocks.
    if (textFromBlocks) return textFromBlocks;
    return typeof toolBlock.input === "string"
      ? toolBlock.input
      : JSON.stringify(toolBlock.input);
  }

  return textFromBlocks;
}

/**
 * Normalize Anthropic wire payload into the provider-agnostic shape:
 * { content?, structured?, finishReason?, ... }
 */
export function mapAnthropicResponseToCanonical(
  raw: ProviderWirePayload,
  request: ProviderAdapterRequest,
  latencyMs: number,
  nowIso: string
): ProviderAdapterResponse {
  const contentBlocks = raw.content as Array<Record<string, unknown>> | undefined;
  const requestedToolName = resolveRequestedStructuredOutputToolName(request);
  const text = extractAnthropicText(contentBlocks, requestedToolName);
  const toolBlock = contentBlocks?.find((block) => block.type === "tool_use");
  const toolName =
    toolBlock && typeof toolBlock.name === "string" ? toolBlock.name : undefined;

  const structuredFromTool =
    toolBlock &&
    shouldPromoteAsStructured(toolBlock.input, requestedToolName, toolName)
      ? (toolBlock.input as Record<string, unknown>)
      : undefined;

  const structuredFromText = (() => {
    if (structuredFromTool || !text.trim()) return undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        shouldPromoteAsStructured(parsed, requestedToolName, requestedToolName)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* not JSON */
    }
    return undefined;
  })();

  const structured = structuredFromTool ?? structuredFromText;

  // Generic, non-sensitive structured-output boundary diagnostic.
  if (requestedToolName || toolBlock) {
    const keys =
      structured && isRecord(structured)
        ? Object.keys(structured).slice(0, 24)
        : [];
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "provider.structured_output.normalize",
        provider: "provider.anthropic",
        model: request.modelId,
        requestId: request.requestId,
        requestedStructuredTool: requestedToolName ?? null,
        responseToolName: toolName ?? null,
        responseContentTypes: (contentBlocks ?? []).map((b) =>
          typeof b.type === "string" ? b.type : "unknown",
        ),
        structuredPresent: structured != null,
        structuredKeyCount: keys.length,
        structuredKeys: keys,
        textPresent: Boolean(text.trim()),
        stopReason: String(raw.stop_reason ?? ""),
      }),
    );
  }

  const usage = (raw.usage as Record<string, unknown>) ?? {};
  const stopReason = String(raw.stop_reason ?? "end_turn");

  return Object.freeze({
    requestId: request.requestId,
    providerId: request.providerId,
    adapterId: request.adapterId,
    modelId: request.modelId,
    output: Object.freeze({
      content: text,
      ...(structured ? { structured } : {}),
      ...(stopReason ? { finishReason: mapFinishReason(stopReason) } : {}),
    }),
    finishReason: mapFinishReason(stopReason),
    usage: Object.freeze({
      promptTokens: numberOrUndef(usage.input_tokens),
      completionTokens: numberOrUndef(usage.output_tokens),
      totalTokens:
        numberOrUndef(usage.input_tokens) !== undefined &&
        numberOrUndef(usage.output_tokens) !== undefined
          ? (usage.input_tokens as number) + (usage.output_tokens as number)
          : undefined,
    }),
    latencyMs,
    warnings: [],
    safety: [],
    streamed: Boolean(request.streaming),
    createdAt: nowIso,
  });
}

function mapFinishReason(finish: string): CanonicalFinishReason {
  switch (finish) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_call";
    default:
      return "unknown";
  }
}

function numberOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
